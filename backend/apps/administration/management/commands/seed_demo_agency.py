"""Build a realistic agency's trading history from a scenario file.

WHY A GENERATOR AND NOT A FIXTURE. `loaddata` writes rows straight into the tables,
bypassing the pricer, the promo reserver, the supplier gateway and the commission
calculator. A fixture can therefore encode a total the pricer would never produce, or a
commission that does not match its order — and the panel would show it without complaint
until somebody tried to reconcile it. Everything here is created through the same
services a real purchase goes through, so the data is consistent because it was MADE
consistently, not because someone hand-checked the numbers.

WHY THE STORY LIVES IN JSON. Dates, group sizes, plan mix and name pools are content, not
logic. `data/demo/alhind-umrah.json` is editable by anyone who wants a different demo
without touching Python.

DEBUG-only unless `--force`. It writes orders, payments and eSIMs that look real; on a
production database that is indistinguishable from fraud in the accounts.

The generator is SEEDED, so the same scenario file produces the same history every run —
a demo that reshuffles itself between rehearsal and presentation is not a demo.
"""

import json
import random
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import Organization, OrganizationMember
from apps.accounts.services import create_agency_tracking_code, create_commission_for_order
from apps.catalog.models import CatalogPlan
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile
from apps.orders import services as order_services
from apps.orders.models import Order
from apps.payments.models import Payment

User = get_user_model()

DEFAULT_SCENARIO = Path(settings.BASE_DIR) / "data" / "demo" / "alhind-umrah.json"
_GB = 1024 ** 3


class Command(BaseCommand):
    help = (
        "Seed a demo travel agency with a realistic Umrah trading history: batches of "
        "pilgrims, their orders, payments, eSIMs, usage and commission."
    )

    def add_arguments(self, parser):
        parser.add_argument("--scenario", default=str(DEFAULT_SCENARIO))
        parser.add_argument("--seed", type=int, default=20260823)
        parser.add_argument(
            "--force", action="store_true",
            help="Allow seeding when DEBUG=False. Never do this on a real database.",
        )
        parser.add_argument(
            "--wipe", action="store_true",
            help="Delete this agency's previous demo data first, so re-running does not stack it up.",
        )

    # -- entry point ------------------------------------------------------------------

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refusing to seed demo trading data with DEBUG=False. This writes orders, "
                "payments and eSIMs that are indistinguishable from real ones in the "
                "accounts. Re-run with --force only if you are certain."
            )

        scenario = self._read(options["scenario"])
        rng = random.Random(options["seed"])

        # THE SUPPLIER GATEWAY IS PINNED TO `fake` FOR THE WHOLE RUN.
        #
        # [MEASURED] The first version of this command inherited whatever `.env` had, and
        # a developer .env pointed at the LIVE eSIM Access API with live credentials. The
        # seeder placed five real supplier orders — real eSIMs, real money off the
        # wallet — before anyone noticed the httpx log lines. They were cancelled and the
        # wallet credited, but the lesson is that "the environment is probably set
        # correctly" is not a safeguard.
        #
        # A demo seeder has NO legitimate reason to reach a real provider, so it does not
        # get the option. This overrides the setting rather than reading it, which means
        # even a misconfigured environment cannot spend money here.
        with override_settings(SUPPLIER_GATEWAY="fake"):
            self._run(scenario, rng, options)

    def _run(self, scenario, rng, options):
        organization, code = self._agency(scenario["agency"])
        spec_bps = scenario["agency"]["commission_bps"] / 100
        if options["wipe"]:
            self._wipe(organization)

        plans = self._plans(scenario)
        totals = {"orders": 0, "paid": 0, "failed": 0, "esims": 0, "travellers": 0}

        for batch in scenario["batches"]:
            made = self._batch(batch, scenario, organization, code, plans, rng)
            for key in totals:
                totals[key] += made[key]
            self.stdout.write(
                f"  {batch['label']:<26} {made['travellers']:>3} travellers  "
                f"{made['paid']:>3} paid  {made['failed']} failed  {made['esims']:>3} eSIMs"
            )

        self.stdout.write(self.style.SUCCESS(
            f"\n{organization.name}: {totals['travellers']} travellers across "
            f"{len(scenario['batches'])} batches — {totals['paid']} paid orders, "
            f"{totals['failed']} failed, {totals['esims']} eSIMs.\n"
            f"Referral link: {settings.FRONTEND_BASE_URL}/r/{code.code}  ({spec_bps}% commission)"
        ))

    # -- pieces -----------------------------------------------------------------------

    def _read(self, path):
        file = Path(path)
        if not file.is_file():
            raise CommandError(f"Scenario file not found: {file}")
        return json.loads(file.read_text())

    def _plans(self, scenario):
        """Resolve the plan mix to real catalogue rows, refusing to guess a substitute."""
        resolved = []
        for entry in scenario["plan_mix"]:
            plan = CatalogPlan.objects.filter(product_code=entry["product_code"]).first()
            if plan is None:
                raise CommandError(
                    f"Plan {entry['product_code']} is not in the catalogue. Import the "
                    "catalogue first (`import_catalog`), or edit the scenario's plan_mix. "
                    "Substituting a different plan would silently change the prices this "
                    "demo shows."
                )
            resolved.append((plan, entry["weight"]))
        return resolved

    def _agency(self, spec):
        organization, _ = Organization.objects.get_or_create(
            name=spec["name"],
            defaults={
                "organization_type": "travel_agency",
                "billing_email": spec["billing_email"],
                "country": spec["country"],
                "status": "active",
                "approved_at": timezone.now(),
            },
        )
        if organization.status != "active":
            organization.status = "active"
            organization.approved_at = timezone.now()
            organization.save(update_fields=["status", "approved_at"])

        owner, created = User.objects.get_or_create(
            email=spec["owner_email"],
            defaults={"first_name": spec["name"].split()[0], "last_name": "Operations"},
        )
        if created:
            # Unusable password: this account exists so the portal has an owner to show,
            # not so anybody can sign in as it. Credentials are issued from the panel.
            owner.set_unusable_password()
            owner.save(update_fields=["password"])
        OrganizationMember.objects.get_or_create(
            organization=organization, user=owner,
            defaults={"role": "owner", "status": "active"},
        )

        code = organization.promo_codes.filter(code=spec["tracking_code"]).first()
        if code is None:
            code = create_agency_tracking_code(
                organization,
                code=spec["tracking_code"],
                commission_bps=spec["commission_bps"],
            )
        return organization, code

    def _wipe(self, organization):
        """Remove this agency's previous demo orders so re-running replaces rather than stacks.

        Ordered by dependency and scoped to THIS organization: a demo reset must never be
        able to reach an order it did not create.
        """
        from apps.esims.models import SupplierEvent
        from apps.orders.models import Notification, OrderItem, PromoRedemption

        orders = Order.objects.filter(referring_organization=organization)
        order_ids = list(orders.values_list("id", flat=True))
        if not order_ids:
            return

        # Order matters, and the database enforces it: `Notification.esim_profile` and
        # `SupplierEvent.esim_profile` are both on_delete=PROTECT, so the profiles cannot
        # go until the rows pointing at them do. Deleting in the wrong order raises
        # ProtectedError rather than cascading, which is the point of PROTECT — a real
        # eSIM's delivery record should never vanish as a side effect of deleting
        # something else.
        Notification.objects.filter(order_id__in=order_ids).delete()
        SupplierEvent.objects.filter(order_item__order_id__in=order_ids).delete()
        EsimProfile.objects.filter(order_item__order_id__in=order_ids).delete()
        organization.commissions.filter(order_id__in=order_ids).delete()
        Payment.objects.filter(order_id__in=order_ids).delete()
        PromoRedemption.objects.filter(order_id__in=order_ids).delete()
        OrderItem.objects.filter(order_id__in=order_ids).delete()
        orders.delete()
        self.stdout.write(f"  wiped {len(order_ids)} previous demo order(s)")

    def _batch(self, batch, scenario, organization, code, plans, rng):
        departs = timezone.datetime.fromisoformat(batch["departs"]).replace(
            tzinfo=timezone.get_current_timezone()
        )
        travelling = departs < timezone.now()
        profile = scenario["realism"]["travelling" if travelling else "upcoming"]
        low, high = batch["travellers"]
        count = rng.randint(low, high)

        made = {"orders": 0, "paid": 0, "failed": 0, "esims": 0, "travellers": count}
        for index in range(count):
            placed = self._placed_at(departs, scenario, rng)
            person = self._person(scenario["names"], rng, batch["departs"], index)
            plan = self._weighted(plans, rng)
            failed = rng.randint(1, 100) <= scenario["realism"]["payment_failed_pct"]

            order = self._order(plan, person, code, placed)
            made["orders"] += 1
            if failed:
                self._fail(order, placed)
                made["failed"] += 1
                continue

            self._settle(order, placed)
            made["paid"] += 1
            if self._provision(order, profile, placed, departs, rng):
                made["esims"] += 1
        return made

    def _placed_at(self, departs, scenario, rng):
        """When the pilgrim bought.

        Never in the future: a group departing next month cannot have an order dated after
        today, and a chart with tomorrow's revenue on it is the fastest way to lose an
        operator's trust in every other number on the screen.
        """
        early, late = scenario["realism"]["order_placed_days_before_departure"]
        placed = departs - timedelta(days=rng.randint(early, late), hours=rng.randint(0, 23))
        now = timezone.now()
        if placed > now:
            placed = now - timedelta(days=rng.randint(0, 13), hours=rng.randint(0, 23))
        return placed

    def _person(self, names, rng, batch_key, index):
        first = rng.choice(names["first"])
        last = rng.choice(names["last"])
        handle = f"{first}.{last}".lower().replace(" ", "")
        # Batch and index in the address keep it unique without a collision loop, and make
        # a row traceable back to the batch that produced it while reading the table.
        return {
            "email": f"{handle}.{batch_key.replace('-', '')}{index:02d}@example.com",
            "first_name": first,
            "last_name": last,
        }

    def _weighted(self, plans, rng):
        total = sum(weight for _, weight in plans)
        pick = rng.uniform(0, total)
        running = 0
        for plan, weight in plans:
            running += weight
            if pick <= running:
                return plan
        return plans[-1][0]

    def _order(self, plan, person, code, placed):
        with transaction.atomic():
            order = order_services.create_order(
                lines=[order_services.OrderLine(catalog_plan_id=plan.id, quantity=1)],
                customer_email=person["email"],
                customer_first_name=person["first_name"],
                customer_last_name=person["last_name"],
                promo_code=code.code,
                requested_currency="USD",
            )
        # `created_at` is auto_now_add, so the history has to be written after the fact.
        Order.objects.filter(pk=order.pk).update(created_at=placed, placed_at=placed)
        order.refresh_from_db()
        return order

    def _fail(self, order, placed):
        payment = Payment.objects.create(
            order=order, provider="stripe", provider_payment_id=f"pi_demo_{order.order_number}",
            idempotency_key=f"demo:{order.id}", amount_minor=order.total_minor,
            currency=order.currency, status="failed",
            failure_code="card_declined", failure_message="Your card was declined.",
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=placed)
        Order.objects.filter(pk=order.pk).update(payment_status="failed", status="failed")
        order_services.release_promo_for_order(order)

    def _settle(self, order, placed):
        payment = Payment.objects.create(
            order=order, provider="stripe", provider_payment_id=f"pi_demo_{order.order_number}",
            idempotency_key=f"demo:{order.id}", amount_minor=order.total_minor,
            currency=order.currency, status="succeeded", paid_at=placed,
        )
        Payment.objects.filter(pk=payment.pk).update(created_at=placed)
        Order.objects.filter(pk=order.pk).update(payment_status="paid", status="paid")
        order.refresh_from_db()
        order_services.consume_promo_for_order(order)
        create_commission_for_order(order)

    def _provision(self, order, profile, placed, departs, rng):
        """Run the real provisioning job, then age the eSIM into the batch's phase."""
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass

        item = order.items.first()
        esim = EsimProfile.objects.filter(order_item=item).first()
        if esim is None:
            return False

        roll = rng.randint(1, 100)
        activated = roll <= profile["activated_pct"]
        installed = activated or roll <= profile["activated_pct"] + profile["installed_not_activated_pct"]

        fields = {"created_at": placed}
        if installed:
            # Installed on arrival, not on purchase — a pilgrim scans the QR at the airport.
            fields["installed_at"] = departs
            fields["smdp_status"] = "ENABLED" if activated else "INSTALLATION"
            fields["esim_status"] = "IN_USE" if activated else "GOT_RESOURCE"
            fields["status"] = "active" if activated else "installed"
        else:
            fields["smdp_status"] = "RELEASED"
            fields["esim_status"] = "GOT_RESOURCE"

        if activated:
            fields["activated_at"] = departs + timedelta(hours=rng.randint(1, 8))
            low, high = profile["data_used_pct_range"]
            used = (esim.total_data_bytes or 0) * rng.randint(low, high) // 100
            fields["remaining_data_bytes"] = max((esim.total_data_bytes or 0) - used, 0)
            fields["last_synced_at"] = timezone.now() - timedelta(hours=rng.randint(1, 5))

        EsimProfile.objects.filter(pk=esim.pk).update(**fields)
        return True
