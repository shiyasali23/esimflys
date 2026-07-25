from django.core.management.base import BaseCommand

from apps.catalog.models import CatalogPlan, Supplier, TopupProduct


class Command(BaseCommand):
    help = (
        "DEMO ONLY: activate catalogue plans (and a demo top-up product) so the API returns "
        "purchasable products. Production activation is a business decision (spec §21)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--countries", default="", help="Comma-separated ISO2 codes. Default: popular countries."
        )
        parser.add_argument("--all", action="store_true", help="Activate every non-retired plan.")
        parser.add_argument(
            "--deactivate", action="store_true", help="Revert all active plans/top-ups to paused."
        )

    def handle(self, *args, **options):
        if options["deactivate"]:
            plans = CatalogPlan.objects.filter(status="active").update(status="paused")
            topups = TopupProduct.objects.filter(
                product_code__startswith="DEMO-TU-"
            ).update(status="paused")
            self.stdout.write(self.style.SUCCESS(f"paused {plans} plans and {topups} demo top-ups"))
            return

        plans = CatalogPlan.objects.exclude(status="retired")
        if options["all"]:
            target = plans
        elif options["countries"]:
            codes = [c.strip().upper() for c in options["countries"].split(",") if c.strip()]
            target = plans.filter(country__iso2__in=codes)
        else:
            target = plans.filter(country__is_popular=True)

        activated = target.filter(status="paused").update(status="active")

        topups = 0
        for supplier in Supplier.objects.filter(plans__status="active").distinct():
            code = f"DEMO-TU-1GB-{supplier.code}"
            _, created = TopupProduct.objects.get_or_create(
                product_code=code,
                defaults={
                    "supplier": supplier,
                    "supplier_package_code": "DEMO-TUP-1GB",
                    "name": "1 GB data top-up",
                    "data_amount_mb": 1000,
                    "validity_days": 30,
                    "retail_amount_minor": 500,
                    "currency": "USD",
                    "status": "active",
                },
            )
            if not created:
                TopupProduct.objects.filter(product_code=code).update(status="active")
            topups += 1

        self.stdout.write(
            self.style.WARNING(
                "DEMO ONLY — not for production. Production activation is a business decision (spec §21)."
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"activated {activated} plans; ensured {topups} demo top-up product(s)"
            )
        )
