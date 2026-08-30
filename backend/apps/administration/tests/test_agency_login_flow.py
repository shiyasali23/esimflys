"""The whole point of the demo, proven end to end over real HTTP.

A seeded agency owner signs in with the platform-issued password, reads its own
commissions, and cannot reach the platform's own admin surface or another agency's data.

Every step goes through the real URLs, the real authentication backend and the real
permission classes. Nothing is stubbed — a test that logged the user in with
`force_authenticate` would still pass if the password were never set.
"""

import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from apps.accounts.models import Organization
from apps.catalog.models import CatalogPlan, Country, Supplier

from .test_seed_demo_agency import write_scenario


@override_settings(DEBUG=True, PAYMENTS_GATEWAY="fake")
class AgencySignsInAndSeesItsCommissions(TestCase):
    PASSWORD = "Umrah-Demo-2026!x"

    def setUp(self):
        supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        country = Country.objects.create(
            iso2="SA", name="Saudi Arabia", slug="saudi-arabia", region="Asia", is_active=True
        )
        CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="SA-TEST",
            supplier_package_code="PKG-SA", plan_type="fixed", display_name="Saudi 10 GB",
            data_limit_mb=10000, validity_days=30, retail_amount_minor=1499,
            wholesale_amount_minor=700, currency="USD", status="active",
        )
        call_command(
            "seed_demo_agency",
            scenario=write_scenario(tempfile.mkdtemp()),
            owner_password=self.PASSWORD,
            stdout=StringIO(), stderr=StringIO(),
        )
        self.org = Organization.objects.get(metadata__demo=True)
        self.owner = self.org.members.get(role="owner").user

    def _login(self, email, password):
        return self.client.post(
            reverse("accounts:login"),
            {"email": email, "password": password},
            content_type="application/json",
        )

    def test_the_seeded_owner_can_actually_sign_in(self):
        response = self._login(self.owner.email, self.PASSWORD)
        self.assertEqual(response.status_code, 200, response.content[:300])

    def test_the_wrong_password_is_refused(self):
        """Proves the login above authenticated, rather than letting anyone in."""
        response = self._login(self.owner.email, "not-the-password")
        self.assertNotEqual(response.status_code, 200)

    def test_the_owner_reads_its_own_commissions(self):
        self._login(self.owner.email, self.PASSWORD)
        response = self.client.get(
            reverse("agency_api:commissions", args=[self.org.id])
        )
        self.assertEqual(response.status_code, 200, response.content[:300])
        rows = response.json()["results"]
        self.assertGreater(len(rows), 0, "a seeded agency with sales must show commission")

    def test_the_dashboard_reports_money_earned(self):
        self._login(self.owner.email, self.PASSWORD)
        response = self.client.get(reverse("agency_api:dashboard", args=[self.org.id]))
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertTrue(response.json(), "dashboard must not be empty for a trading agency")

    def test_the_owner_cannot_reach_the_platform_admin_surface(self):
        """The separation the whole design rests on: this is an agency login, not a
        superuser login. Both surfaces are Django sessions on one domain, so the gate is
        the permission class, not the cookie."""
        self._login(self.owner.email, self.PASSWORD)
        response = self.client.get(reverse("admin_api:commission-list"))
        self.assertIn(response.status_code, (403, 404), response.status_code)

    def test_the_owner_cannot_read_another_agency_by_swapping_the_id(self):
        other = Organization.objects.create(
            name="Rival Tours", organization_type="travel_agency", status="active"
        )
        self._login(self.owner.email, self.PASSWORD)
        response = self.client.get(reverse("agency_api:commissions", args=[other.id]))
        self.assertEqual(response.status_code, 404)

    def test_signed_out_callers_get_nothing(self):
        response = self.client.get(reverse("agency_api:commissions", args=[self.org.id]))
        self.assertIn(response.status_code, (401, 403, 404))
