from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.catalog.models import CatalogPlan


class Command(BaseCommand):
    """Populate the catalogue only when it is empty. Safe on every boot.

    This exists so a fresh database self-populates without anyone remembering to run
    two commands by hand — the state that shipped a storefront with 385 imported plans
    and ``active plans now: 0``, i.e. nothing purchasable.

    The emptiness check is the point. Running ``import_catalog`` unconditionally would
    rewrite every plan row from the workbook on each deploy, silently reverting any
    price edited in Django admin. Guarding on "no plans at all" means the workbook
    seeds a new database, and after that the database is authoritative.

    To re-import deliberately (e.g. the workbook changed), run ``import_catalog``
    directly — this command is only the automatic first-run path.
    """

    help = "Import and activate the catalogue only if no plans exist yet. Idempotent."

    def handle(self, *args, **options):
        existing = CatalogPlan.objects.count()

        if existing:
            active = CatalogPlan.objects.filter(status="active").count()
            self.stdout.write(f"catalogue present: {existing} plans, {active} active — skipping import")
            if not active:
                # Not auto-fixed: every plan being paused is also what a deliberate
                # "stop selling" looks like, and quietly re-activating would override
                # that. Say it loudly instead.
                self.stdout.write(
                    self.style.WARNING(
                        "  no active plans — the storefront has nothing to sell. "
                        "Run: python manage.py activate_demo_catalog --all"
                    )
                )
            return

        self.stdout.write("catalogue empty — importing and activating")
        call_command("import_catalog")
        call_command("activate_demo_catalog", all=True)
        self.stdout.write(
            self.style.SUCCESS(
                f"catalogue ready: {CatalogPlan.objects.filter(status='active').count()} active plans"
            )
        )
