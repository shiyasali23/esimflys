"""Reusable building blocks for database reset workflows.

Both ``reset_full`` and ``reset_readonly`` compose the step functions defined here, so
future reset/bootstrap operations can reuse the same logic rather than duplicating it.

Every step takes a ``log`` callable (``log(message, level="info")``) so the caller
controls presentation, and raises :class:`ResetError` with an actionable message when a
step cannot complete safely.

Terminology
-----------
**Reference data** is catalogue data owned by an external source of truth (the supplier
workbook): countries, suppliers, catalogue plans and top-up products. It is safe to
re-derive at any time.

**Transactional data** is everything the application or its customers generate: users,
organizations, carts, orders, payments, refunds, commissions, eSIM profiles,
notifications. It is never touched by ``reset_readonly``.
"""

import logging
import subprocess
import sys
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.db import connection, transaction
from django.db.models import Count

logger = logging.getLogger(__name__)


class ResetError(Exception):
    """Raised when a reset step cannot complete safely."""


def _noop_log(message, level="info"):
    getattr(logger, level, logger.info)(message)


def schema_exists():
    """Return ``True`` when the database already has Django's migration table."""
    return "django_migrations" in connection.introspection.table_names()


def flush_database(*, log=_noop_log):
    """Remove all rows from every table, leaving the schema intact.

    Skipped when the database has no schema yet (a fresh database has nothing to
    flush), which keeps the command safe to run against an empty database.
    """
    if not schema_exists():
        log("database has no schema yet — nothing to flush", "warning")
        return False
    call_command("flush", "--noinput", verbosity=0)
    log("flushed all application data")
    return True


def run_migrations(*, log=_noop_log):
    """Apply any outstanding migrations."""
    call_command("migrate", verbosity=0)
    log("migrations applied")


def ensure_superuser(*, log=_noop_log, email=None, password=None):
    """Create (or update) an admin account so Django admin is reachable after a flush.

    Credentials come from the arguments or the ``DJANGO_SUPERUSER_EMAIL`` /
    ``DJANGO_SUPERUSER_PASSWORD`` environment variables. Skipped when absent.
    """
    import os

    from django.contrib.auth import get_user_model

    email = email or os.environ.get("DJANGO_SUPERUSER_EMAIL")
    password = password or os.environ.get("DJANGO_SUPERUSER_PASSWORD")
    if not email or not password:
        log("no superuser credentials supplied — skipping", "warning")
        return None

    user_model = get_user_model()
    user, created = user_model.objects.get_or_create(email=email)
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.set_password(password)
    user.save()
    log(f"superuser {'created' if created else 'updated'}: {email}")
    return user


def load_fixtures(*, log=_noop_log, fixtures_dir=None):
    """Load every ``*.json`` fixture from ``BASE_DIR/fixtures`` when the directory exists."""
    directory = Path(fixtures_dir) if fixtures_dir else Path(settings.BASE_DIR) / "fixtures"
    files = sorted(directory.glob("*.json")) if directory.is_dir() else []
    if not files:
        log("no fixtures found — skipping")
        return 0
    call_command("loaddata", *[str(path) for path in files], verbosity=0)
    log(f"loaded {len(files)} fixture file(s)")
    return len(files)


def import_reference_data(*, log=_noop_log, path=None):
    """Import the supplier catalogue (Excel workbook or generated JSON).

    The underlying command upserts by stable key and never activates a plan, so this is
    safe to run repeatedly.
    """
    options = {"path": str(path)} if path else {}
    call_command("import_catalog", verbosity=0, **options)
    log("reference catalogue imported")


def activate_demo_catalogue(*, log=_noop_log, countries=None):
    """DEMO ONLY: activate plans so the storefront returns purchasable products."""
    options = {"countries": countries} if countries else {}
    call_command("activate_demo_catalog", verbosity=0, **options)
    log("demo catalogue activated (DEMO ONLY — not for production)", "warning")


def delete_unreferenced_reference_data(*, log=_noop_log):
    """Delete reference rows that no transactional record depends on.

    Catalogue rows are protected by ``on_delete=PROTECT`` because order items, cart items
    and eSIM profiles snapshot them — deleting a referenced row would destroy immutable
    order history. Rows that *are* referenced are therefore left in place and refreshed
    in-place by the subsequent import instead of being recreated.
    """
    catalog_plan = apps.get_model("catalog", "CatalogPlan")
    country = apps.get_model("catalog", "Country")
    topup_product = apps.get_model("catalog", "TopupProduct")

    removed = {}
    removed["topup_products"], _ = topup_product.objects.filter(
        cart_items__isnull=True, order_items__isnull=True, fulfillments__isnull=True
    ).delete()
    removed["catalog_plans"], _ = catalog_plan.objects.filter(
        cart_items__isnull=True, order_items__isnull=True, topup_products__isnull=True
    ).delete()
    removed["countries"], _ = country.objects.filter(plans__isnull=True).delete()

    log(
        "removed unreferenced reference rows: "
        + ", ".join(f"{key}={value}" for key, value in removed.items())
    )
    return removed


def reset_reference_data(*, log=_noop_log, path=None):
    """Reset read-only catalogue data without touching transactional data.

    Unreferenced rows are deleted, then the catalogue is re-imported from the source.
    Referenced rows survive (see :func:`delete_unreferenced_reference_data`) and are
    refreshed by the import's upsert, so the end state matches the source either way.
    """
    with transaction.atomic():
        removed = delete_unreferenced_reference_data(log=log)
    import_reference_data(log=log, path=path)
    return removed


def validate_reference_data(*, log=_noop_log, path=None):
    """Validate stored catalogue data against the source and its own invariants.

    Returns ``{"problems": [...], "stats": {...}}``. An empty ``problems`` list means the
    imported data is consistent.
    """
    from apps.catalog.management.commands.import_catalog import load_catalogue_source

    catalog_plan = apps.get_model("catalog", "CatalogPlan")
    country = apps.get_model("catalog", "Country")
    supplier = apps.get_model("catalog", "Supplier")

    problems = []
    stats = {
        "countries": country.objects.count(),
        "plans": catalog_plan.objects.count(),
        "suppliers": supplier.objects.count(),
        "active_plans": catalog_plan.objects.filter(status="active").count(),
    }

    if stats["suppliers"] == 0:
        problems.append("no suppliers present")
    if stats["countries"] == 0:
        problems.append("no countries present")
    if stats["plans"] == 0:
        problems.append("no catalogue plans present")

    orphaned = catalog_plan.objects.filter(country__isnull=True).count()
    if orphaned:
        problems.append(f"{orphaned} plan(s) have no country")

    bad_price = catalog_plan.objects.filter(retail_amount_minor__lte=0).count()
    if bad_price:
        problems.append(f"{bad_price} plan(s) have a non-positive retail price")

    duplicate_defaults = (
        catalog_plan.objects.filter(is_default_selected=True)
        .exclude(status="retired")
        .values("country_id")
        .annotate(total=Count("id"))
        .filter(total__gt=1)
        .count()
    )
    if duplicate_defaults:
        problems.append(f"{duplicate_defaults} country(ies) have more than one default plan")

    try:
        source_path, kind, source_countries, source_plans = load_catalogue_source(path)
    except Exception as exc:
        problems.append(f"could not read catalogue source for cross-check: {exc}")
        log(f"validation: {len(problems)} problem(s)", "warning" if problems else "info")
        return {"problems": problems, "stats": stats}

    stats["source"] = f"{kind}:{Path(source_path).name}"
    stats["source_countries"] = len(source_countries)
    stats["source_plans"] = len(source_plans)

    if len(source_countries) != stats["countries"]:
        problems.append(
            f"country count mismatch: source={len(source_countries)} db={stats['countries']}"
        )
    if len(source_plans) != stats["plans"]:
        problems.append(
            f"plan count mismatch: source={len(source_plans)} db={stats['plans']}"
        )

    source_codes = {row["product_code"] for row in source_plans}
    db_codes = set(catalog_plan.objects.values_list("product_code", flat=True))
    missing = source_codes - db_codes
    if missing:
        problems.append(f"{len(missing)} source plan(s) missing from the database")

    source_iso2 = {row["iso2"] for row in source_countries}
    db_iso2 = set(country.objects.values_list("iso2", flat=True))
    if source_iso2 - db_iso2:
        problems.append(f"{len(source_iso2 - db_iso2)} source country(ies) missing from the database")

    log(
        f"validation: {len(problems)} problem(s); "
        f"{stats['countries']} countries, {stats['plans']} plans, "
        f"{stats['active_plans']} active",
        "warning" if problems else "info",
    )
    return {"problems": problems, "stats": stats}


def run_test_suite(*, log=_noop_log, labels=None, verbosity=1):
    """Run the test suite in a subprocess and return ``(returncode, output)``.

    A subprocess is used deliberately: the suite must see a real ``manage.py test`` argv
    (settings disable API throttling only for test runs) and must not inherit state from
    the reset steps. The test runner builds its own ``test_*`` database, so the
    development database is never touched.
    """
    manage_py = Path(settings.BASE_DIR) / "manage.py"
    command = [sys.executable, str(manage_py), "test", *(labels or ["apps"]), "--noinput"]
    command += ["--verbosity", str(verbosity)]
    log(f"running test suite: {' '.join(command[1:])}")
    completed = subprocess.run(
        command, cwd=str(settings.BASE_DIR), capture_output=True, text=True
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    return completed.returncode, output


def start_dev_server(*, log=_noop_log, addrport="127.0.0.1:8000"):
    """Start the development server in the foreground.

    The autoreloader is disabled: it would re-execute the parent management command and
    repeat the whole reset.
    """
    log(f"starting development server on http://{addrport}/")
    call_command("runserver", addrport, use_reloader=False)
