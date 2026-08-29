"""The demo seeder.

The test that matters most is `test_never_calls_a_real_supplier`. The first version of
this command inherited `SUPPLIER_GATEWAY` from the environment, a developer `.env` pointed
at the live eSIM Access API with live credentials, and seeding placed five real supplier
orders — real eSIMs, real money off the wallet — before the httpx log lines were noticed.
They were cancelled and the wallet credited. The command now pins the gateway itself, and
this test is what stops that pin being removed by someone who assumes the environment is
set correctly.
"""

import json
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.accounts.models import Organization, PartnerCommission
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims.models import EsimProfile
from apps.orders.models import Order

SCENARIO = {
    "agency": {
        "name": "Test Travels", "billing_email": "a@b.test", "country": "IN",
        "owner_email": "owner@b.test", "tracking_code": "TESTTRAVEL", "commission_bps": 1200,
    },
    "destination_slug": "saudi-arabia",
    "batches": [
        {"label": "Past batch", "departs": "2026-08-01", "nights": 10, "travellers": [3, 3]},
        {"label": "Future batch", "departs": "2099-01-01", "nights": 10, "travellers": [2, 2]},
    ],
    "plan_mix": [{"product_code": "SA-TEST", "weight": 100}],
    "realism": {
        "payment_failed_pct": 0,
        "order_placed_days_before_departure": [3, 5],
        "travelling": {
            "activated_pct": 100, "installed_not_activated_pct": 0,
            "never_installed_pct": 0, "data_used_pct_range": [40, 60],
        },
        "upcoming": {
            "activated_pct": 0, "installed_not_activated_pct": 0,
            "never_installed_pct": 100, "data_used_pct_range": [0, 0],
        },
    },
    "names": {"first": ["Fathima"], "last": ["Koya"]},
}


def write_scenario(tmp, **overrides):
    data = json.loads(json.dumps(SCENARIO))
    data.update(overrides)
    path = Path(tmp) / "scenario.json"
    path.write_text(json.dumps(data))
    return str(path)


@override_settings(DEBUG=True, PAYMENTS_GATEWAY="fake")
class SeedDemoAgencyTests(TestCase):
    def setUp(self):
        import tempfile

        self.tmp = tempfile.mkdtemp()
        supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
        country = Country.objects.create(
            iso2="SA", name="Saudi Arabia", slug="saudi-arabia", region="Asia", is_active=True
        )
        CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="SA-TEST",
            supplier_package_code="PKG-SA", plan_type="fixed", display_name="Saudi 10 GB",
            data_limit_mb=10000, validity_days=30, retail_amount_minor=1499,
            wholesale_amount_minor=700, currency="USD", status="active",
        )

    def _seed(self, tmp, **kw):
        call_command("seed_demo_agency", scenario=write_scenario(tmp), **kw)

    # -- the one that cost money ------------------------------------------------------

    @override_settings(SUPPLIER_GATEWAY="esim_access")
    def test_pins_the_supplier_gateway_to_fake_while_it_runs(self):
        """The environment says `esim_access`; the command must see `fake` regardless.

        This asserts the setting AS OBSERVED INSIDE the command, which is the only honest
        way to test it here. The obvious test — mock `EsimAccessGateway` and assert it is
        never constructed — is VACUOUS in this suite: `config/settings.py:389` forces
        `SUPPLIER_GATEWAY = "fake"` whenever "test" is in sys.argv, so the real gateway
        can never be built during a test run and the assertion passes whether the pin
        exists or not. [MEASURED] removing the pin left that version of this test green.

        The pin is what stopped a developer `.env` pointing at the live API from placing
        five real supplier orders, so it needs a test that actually fails without it.
        """
        from django.conf import settings as live_settings
        from apps.administration.management.commands import seed_demo_agency

        seen = []
        original = seed_demo_agency.Command._run

        def spy(self, *args, **kwargs):
            seen.append(live_settings.SUPPLIER_GATEWAY)
            return original(self, *args, **kwargs)

        with mock.patch.object(seed_demo_agency.Command, "_run", spy):
            self._seed(self.tmp)

        self.assertEqual(seen, ["fake"], "the command ran against a non-fake supplier gateway")
        self.assertTrue(Order.objects.exists(), "seeding produced no orders")

    # -- content ----------------------------------------------------------------------

    def test_builds_the_agency_with_its_tracking_code(self):
        self._seed(self.tmp)
        org = Organization.objects.get(name="Test Travels")
        self.assertEqual(org.status, "active")
        self.assertTrue(org.promo_codes.filter(code="TESTTRAVEL").exists())

    def test_attributes_every_order_to_the_agency(self):
        self._seed(self.tmp)
        self.assertEqual(Order.objects.exclude(referring_organization__name="Test Travels").count(), 0)

    def test_commission_matches_the_configured_rate(self):
        """Checked PER ORDER, not against the total.

        The service floors each commission to whole minor units on its own row, so the
        sum of the floors is not the floor of the sum — measured here as 895 against 899.
        Asserting on the total would either fail correct code or force the service to
        round in a way that leaves individual rows wrong, and each row is a real amount
        somebody is owed.
        """
        self._seed(self.tmp)
        commissions = {c.order_id: c for c in PartnerCommission.objects.all()}
        paid = Order.objects.filter(payment_status="paid")
        self.assertEqual(len(commissions), paid.count())
        for order in paid:
            expected = commissions[order.id].commissionable_minor * 1200 // 10000
            self.assertEqual(commissions[order.id].commission_minor, expected)

    def test_only_the_departed_batch_has_used_data(self):
        """A group that has not left yet cannot have consumed anything — a demo that shows
        usage on a future trip teaches an operator to distrust the column."""
        self._seed(self.tmp)
        future = EsimProfile.objects.filter(status="ready")
        self.assertTrue(future.exists())
        for esim in future:
            self.assertEqual(esim.remaining_data_bytes, esim.total_data_bytes)
            self.assertIsNone(esim.activated_at)

    def test_no_order_is_dated_in_the_future(self):
        """A chart with tomorrow's revenue on it discredits every other number on screen."""
        from django.utils import timezone

        self._seed(self.tmp)
        for order in Order.objects.all():
            self.assertLessEqual(order.created_at, timezone.now())

    def test_is_reproducible_for_a_given_seed(self):
        self._seed(self.tmp)
        first = sorted(Order.objects.values_list("customer_email", flat=True))
        self._seed(self.tmp, wipe=True)
        self.assertEqual(sorted(Order.objects.values_list("customer_email", flat=True)), first)

    def test_wipe_replaces_rather_than_stacks(self):
        self._seed(self.tmp)
        count = Order.objects.count()
        self._seed(self.tmp, wipe=True)
        self.assertEqual(Order.objects.count(), count)

    def test_never_leaves_a_demo_email_queued_for_sending(self):
        """Every address in the scenario is `@example.com`, which accepts no mail. Handing
        two hundred guaranteed hard bounces to the sending domain is how its reputation is
        damaged — and the real customers' confirmations go out through that same domain."""
        from apps.orders.models import Notification

        self._seed(self.tmp)
        pending = Notification.objects.filter(status__in=("queued", "retrying"))
        self.assertEqual(pending.count(), 0, "demo notifications were left queued to send")
        self.assertTrue(
            Notification.objects.filter(status="cancelled").exists(),
            "the suppressed notifications should still exist as evidence",
        )

    # -- guards -----------------------------------------------------------------------

    @override_settings(DEBUG=False)
    def test_refuses_to_run_against_a_production_database(self):
        with self.assertRaises(CommandError):
            self._seed(self.tmp)

    def test_refuses_a_plan_that_is_not_in_the_catalogue(self):
        """Substituting a different plan would silently change every price on the demo."""
        path = write_scenario(self.tmp, plan_mix=[{"product_code": "NOPE", "weight": 100}])
        with self.assertRaises(CommandError):
            call_command("seed_demo_agency", scenario=path)
