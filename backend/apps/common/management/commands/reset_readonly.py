"""Reset only read-only reference data (the Excel catalogue), then start the server.

Preserves every piece of transactional data — users, organizations, carts, orders,
payments, refunds, commissions, eSIM profiles and notifications are untouched.

Reference rows that are referenced by transactional records (an ordered plan, for
example) are protected by ``on_delete=PROTECT`` because order items snapshot them.
Those rows are refreshed in place by the import's upsert rather than deleted, so the
end state still matches the source workbook without destroying order history.

Exit codes
----------
``0`` success · ``1`` unexpected error · ``4`` reference-data validation failed
"""

from apps.common import reset

from ._reset_base import BaseResetCommand


class Command(BaseResetCommand):
    help = (
        "Re-sync read-only reference data (countries, suppliers, plans, top-up products) "
        "from the Excel workbook while preserving all transactional data, validate the "
        "result, then start the development server."
    )
    total_steps = 3

    def add_arguments(self, parser):
        parser.add_argument(
            "--path", default=None,
            help="Path to the catalogue workbook (.xlsx) or catalog.json.",
        )
        parser.add_argument(
            "--demo", action="store_true",
            help="DEMO ONLY: activate catalogue plans after import.",
        )
        parser.add_argument("--demo-countries", default=None, help="ISO2 list for --demo.")
        parser.add_argument(
            "--no-runserver", action="store_true",
            help="Finish after validation instead of starting the server.",
        )
        parser.add_argument("--addrport", default="127.0.0.1:8000")

    def handle(self, *args, **options):
        self.step("Resetting read-only reference data")
        self.log("transactional data (users, orders, payments, eSIMs) is preserved")
        reset.reset_reference_data(log=self.log, path=options["path"])
        if options["demo"]:
            reset.activate_demo_catalogue(log=self.log, countries=options["demo_countries"])

        self.step("Validating imported data")
        report = reset.validate_reference_data(log=self.log, path=options["path"])
        self.fail_on_validation(report)
        for key, value in report["stats"].items():
            self.log(f"{key}: {value}")

        self.step("Starting development server")
        if options["no_runserver"]:
            self.log("skipped (--no-runserver)", "warning")
            self.stdout.write(self.style.SUCCESS("\nreset_readonly completed successfully."))
            return
        reset.start_dev_server(log=self.log, addrport=options["addrport"])
