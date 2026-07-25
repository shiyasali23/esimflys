from rest_framework.test import APITestCase

from apps.catalog.models import CatalogPlan, Country, Supplier


class CatalogAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        cls.france = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe",
            is_active=True, sort_order=0,
        )
        cls.italy = Country.objects.create(
            iso2="IT", name="Italy", slug="italy", region="Europe",
            is_active=True, sort_order=1,
        )
        cls.hidden = Country.objects.create(
            iso2="ZZ", name="Hidden", slug="hidden", region="Europe",
            is_active=False, sort_order=2,
        )
        cls.active_plan = CatalogPlan.objects.create(
            supplier=cls.supplier, country=cls.france, product_code="FR-5GB-30D",
            supplier_package_code="PKG1", plan_type="fixed", display_name="France 5 GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            wholesale_amount_minor=600, currency="USD", status="active",
            is_default_selected=True, sort_order=1,
        )
        cls.paused_plan = CatalogPlan.objects.create(
            supplier=cls.supplier, country=cls.france, product_code="FR-1GB-7D",
            supplier_package_code="PKG2", plan_type="fixed", display_name="France 1 GB",
            data_limit_mb=1000, validity_days=7, retail_amount_minor=700,
            status="paused", sort_order=2,
        )
        # Italy has only a paused plan -> price_from must be null.
        CatalogPlan.objects.create(
            supplier=cls.supplier, country=cls.italy, product_code="IT-2GB-15D",
            supplier_package_code="PKG3", plan_type="fixed", display_name="Italy 2 GB",
            data_limit_mb=2000, validity_days=15, retail_amount_minor=900,
            status="paused", sort_order=1,
        )

    def test_no_auth_required(self):
        self.assertEqual(self.client.get("/api/v1/catalog/countries/").status_code, 200)

    def test_countries_list_active_only(self):
        response = self.client.get("/api/v1/catalog/countries/")
        slugs = [c["slug"] for c in response.data]
        self.assertIn("france", slugs)
        self.assertIn("italy", slugs)
        self.assertNotIn("hidden", slugs)

    def test_price_from_uses_active_plans_only(self):
        response = self.client.get("/api/v1/catalog/countries/france/")
        # 1500 minor / 30 days = 50 minor/day = $0.50
        self.assertEqual(response.data["price_from"], {"amount": "0.50", "currency": "USD"})
        self.assertEqual(response.data["plan_count"], 1)

    def test_price_from_null_when_no_active_plans(self):
        response = self.client.get("/api/v1/catalog/countries/italy/")
        self.assertIsNone(response.data["price_from"])
        self.assertEqual(response.data["plan_count"], 0)

    def test_plans_endpoint_excludes_paused_and_sensitive_fields(self):
        response = self.client.get("/api/v1/catalog/countries/france/plans/")
        codes = [p["product_code"] for p in response.data]
        self.assertEqual(codes, ["FR-5GB-30D"])
        plan = response.data[0]
        for hidden_field in (
            "wholesale_amount_minor", "supplier", "supplier_package_code",
            "supplier_metadata", "tier", "supplier_verified_at",
        ):
            self.assertNotIn(hidden_field, plan)
        self.assertEqual(plan["retail_amount_minor"], 1500)
        self.assertEqual(plan["price_per_day"], {"amount": "0.50", "currency": "USD"})

    def test_plan_detail_active_includes_country(self):
        response = self.client.get("/api/v1/catalog/plans/FR-5GB-30D/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["country"]["iso2"], "FR")
        self.assertNotIn("wholesale_amount_minor", response.data)

    def test_plan_detail_paused_returns_404_envelope(self):
        response = self.client.get("/api/v1/catalog/plans/FR-1GB-7D/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"]["code"], "not_found")

    def test_inactive_country_detail_404(self):
        self.assertEqual(self.client.get("/api/v1/catalog/countries/hidden/").status_code, 404)

    def test_inactive_country_plans_404(self):
        self.assertEqual(
            self.client.get("/api/v1/catalog/countries/hidden/plans/").status_code, 404
        )
