"""Full database reset: flush, migrate, repopulate, test, then start the server.

Destructive — it deletes **all** data, including users and orders. Guarded by an
interactive confirmation and a refusal to run when ``DEBUG=False``.

Exit codes
----------
``0`` success · ``1`` unexpected error · ``2`` test suite failed (server not started) ·
``3`` aborted / unsafe environment · ``4`` reference-data validation failed
"""

from django.db import transaction

from apps.common import reset

from ._reset_base import BaseResetCommand
from django.core.management.base import CommandError

EXIT_TESTS_FAILED = 2


class Command(BaseResetCommand):
    help = (
        "Flush the database, re-run migrations, repopulate all initial data (system data, "
        "Excel catalogue, fixtures), run the full test suite, and start the development "
        "server only if every test passes."
    )
    total_steps = 5

    def add_arguments(self, parser):
        parser.add_argument(
            "--noinput", "--no-input", action="store_true", dest="noinput",
            help="Do not prompt for confirmation before deleting data.",
        )
        parser.add_argument(
            "--force", action="store_true",
            help="Allow the reset to run even when DEBUG=False.",
        )
        parser.add_argument(
            "--catalogue-path", default=None,
            help="Path to the catalogue workbook (.xlsx) or catalog.json.",
        )
        parser.add_argument("--fixtures-dir", default=None, help="Directory of *.json fixtures.")
        parser.add_argument("--superuser-email", default=None)
        parser.add_argument("--superuser-password", default=None)
        parser.add_argument(
            "--demo", action="store_true",
            help="DEMO ONLY: activate catalogue plans after import.",
        )
        parser.add_argument("--demo-countries", default=None, help="ISO2 list for --demo.")
        parser.add_argument("--skip-tests", action="store_true", help="Skip the test suite.")
        parser.add_argument(
            "--test-labels", nargs="*", default=None,
            help="Test labels to run (default: apps).",
        )
        parser.add_argument(
            "--no-runserver", action="store_true",
            help="Finish after tests instead of starting the server.",
        )
        parser.add_argument("--addrport", default="127.0.0.1:8000")

    def handle(self, *args, **options):
        self.guard_environment(options["force"])
        self.confirm_destructive(options["noinput"])

        self.step("Flushing database")
        reset.flush_database(log=self.log)

        self.step("Applying migrations")
        reset.run_migrations(log=self.log)

        self.step("Repopulating initial data")
        with transaction.atomic():
            reset.ensure_superuser(
                log=self.log,
                email=options["superuser_email"],
                password=options["superuser_password"],
            )
            reset.import_reference_data(log=self.log, path=options["catalogue_path"])
            reset.load_fixtures(log=self.log, fixtures_dir=options["fixtures_dir"])
            if options["demo"]:
                reset.activate_demo_catalogue(
                    log=self.log, countries=options["demo_countries"]
                )
        report = reset.validate_reference_data(log=self.log, path=options["catalogue_path"])
        self.fail_on_validation(report)

        self.step("Running test suite")
        if options["skip_tests"]:
            self.log("skipped (--skip-tests)", "warning")
        else:
            returncode, output = reset.run_test_suite(
                log=self.log, labels=options["test_labels"]
            )
            if returncode != 0:
                self.stdout.write(self.style.ERROR("\n--- test output ---"))
                self.stdout.write(output)
                self.stdout.write(self.style.ERROR("--- end test output ---\n"))
                raise CommandError(
                    "Test suite failed — the development server was NOT started.",
                    returncode=EXIT_TESTS_FAILED,
                )
            summary = next(
                (line for line in reversed(output.splitlines()) if line.startswith("Ran ")),
                "tests completed",
            )
            self.log(f"all tests passed ({summary})", "success")

        self.step("Starting development server")
        if options["no_runserver"]:
            self.log("skipped (--no-runserver)", "warning")
            self.stdout.write(self.style.SUCCESS("\nreset_full completed successfully."))
            return
        reset.start_dev_server(log=self.log, addrport=options["addrport"])
