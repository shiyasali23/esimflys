from unittest.mock import patch

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.common import reset
from apps.common.exceptions import api_exception_handler
from apps.orders import services as order_services


class UpdatedAtTriggerTests(TestCase):
    def test_direct_sql_update_bumps_updated_at(self):
        country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe"
        )
        before = country.updated_at
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE countries SET name = 'France!' WHERE id = %s", [str(country.id)]
            )
        country.refresh_from_db()
        self.assertGreater(country.updated_at, before)


class ErrorHandlerTests(TestCase):
    @override_settings(DEBUG=False)
    def test_unhandled_exception_returns_correlation_id_envelope(self):
        response = api_exception_handler(ValueError("boom"), {})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["error"]["code"], "internal_error")
        self.assertIn("correlation_id", response.data["error"])

    @override_settings(DEBUG=True)
    def test_unhandled_exception_reraises_in_debug(self):
        self.assertIsNone(api_exception_handler(ValueError("boom"), {}))


class ReferenceResetTests(TestCase):
    """The read-only reset must never destroy catalogue rows that orders depend on."""

    def _plan(self, supplier, country, code, status="active"):
        return CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code=code,
            supplier_package_code="PKG", plan_type="fixed", display_name=code,
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            currency="USD", status=status,
        )

    def test_unreferenced_rows_deleted_and_referenced_rows_preserved(self):
        supplier = Supplier.objects.create(code="s", name="S", status="active")
        country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        orphan_country = Country.objects.create(
            iso2="IT", name="Italy", slug="italy", region="Europe", is_active=True
        )
        self._plan(supplier, country, "KEEP")
        self._plan(supplier, country, "DROP")

        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="KEEP", quantity=1)
        order_services.checkout(cart_id=cart.id, customer_email="a@b.com")

        reset.delete_unreferenced_reference_data()

        self.assertTrue(CatalogPlan.objects.filter(product_code="KEEP").exists())
        self.assertFalse(CatalogPlan.objects.filter(product_code="DROP").exists())
        self.assertTrue(Country.objects.filter(iso2="FR").exists())
        self.assertFalse(Country.objects.filter(iso2=orphan_country.iso2).exists())

    def test_validation_reports_problems_when_database_is_empty(self):
        report = reset.validate_reference_data()
        self.assertTrue(report["problems"])
        self.assertIn("stats", report)


class ThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_auth_endpoint_is_rate_limited(self):
        original_get_rate = ScopedRateThrottle.get_rate

        def small_rate(self):
            if getattr(self, "scope", None) == "auth":
                return "3/min"
            return original_get_rate(self)

        with patch.object(ScopedRateThrottle, "get_rate", small_rate):
            statuses = []
            for _ in range(5):
                response = self.client.post(
                    "/api/v1/auth/login/",
                    {"email": "nobody@example.com", "password": "whatever-123"},
                    format="json",
                )
                statuses.append(response.status_code)
        self.assertIn(429, statuses)
        self.assertEqual(statuses[-1], 429)
