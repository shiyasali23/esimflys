from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, OrganizationMember, PartnerCommission, User
from apps.accounts.services import create_agency_tracking_code, create_commission_for_order
from apps.administration.models import AuditEvent
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile

from .test_admin_read_api import build_catalogue, place_order, settle
from .test_tenancy import make_member, make_org


def agency_url(organization, suffix=""):
    return f"/api/v1/agency/{organization.id}/{suffix}"


#: Every agency endpoint, used by the isolation sweep.
AGENCY_ENDPOINTS = (
    "dashboard/", "profile/", "members/", "sales/", "commissions/", "payouts/",
    "tracking-codes/", "reports/revenue/", "activity/",
)


@override_settings(SUPPLIER_GATEWAY="fake")
class AgencyScenario(APITestCase):
    """Two agencies, each with a tracking code and an attributed sale."""

    def setUp(self):
        build_catalogue()
        self.alpha = make_org("Alpha")
        self.beta = make_org("Beta")
        self.alpha_owner = make_member(self.alpha, "alpha-owner@example.com", "owner")
        self.alpha_viewer = make_member(self.alpha, "alpha-viewer@example.com", "viewer")
        self.alpha_buyer = make_member(self.alpha, "alpha-buyer@example.com", "buyer")
        self.alpha_admin = make_member(self.alpha, "alpha-admin@example.com", "admin")
        self.beta_owner = make_member(self.beta, "beta-owner@example.com", "owner")

        create_agency_tracking_code(self.alpha, code="ALPHA20")
        create_agency_tracking_code(self.beta, code="BETA20")

        self.alpha_order = place_order(email="alpha-customer@example.com", promo="ALPHA20")
        settle(self.alpha_order)
        self.alpha_commission = create_commission_for_order(self.alpha_order)

        self.beta_order = place_order(email="beta-customer@example.com", promo="BETA20")
        settle(self.beta_order)
        create_commission_for_order(self.beta_order)


class TenantIsolationTests(AgencyScenario):
    def test_every_endpoint_is_404_for_a_non_member(self):
        self.client.force_authenticate(self.beta_owner)
        for suffix in AGENCY_ENDPOINTS:
            response = self.client.get(agency_url(self.alpha, suffix))
            self.assertEqual(response.status_code, 404, suffix)

    def test_anonymous_is_rejected_everywhere(self):
        for suffix in AGENCY_ENDPOINTS:
            response = self.client.get(agency_url(self.alpha, suffix))
            self.assertIn(response.status_code, (401, 403, 404), suffix)

    def test_sales_are_scoped_to_the_tenant(self):
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.get(agency_url(self.alpha, "sales/"))
        numbers = [row["order_number"] for row in response.data["results"]]
        self.assertEqual(numbers, [self.alpha_order.order_number])
        self.assertNotIn(self.beta_order.order_number, numbers)

    def test_commissions_are_scoped_to_the_tenant(self):
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.get(agency_url(self.alpha, "commissions/"))
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["order_number"], self.alpha_order.order_number
        )

    def test_tracking_codes_are_scoped_to_the_tenant(self):
        self.client.force_authenticate(self.alpha_owner)
        codes = [c["code"] for c in self.client.get(agency_url(self.alpha, "tracking-codes/")).data]
        self.assertEqual(codes, ["ALPHA20"])

    def test_activity_is_scoped_to_the_tenant(self):
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.get(agency_url(self.alpha, "activity/"))
        organization_ids = {
            AuditEvent.objects.get(pk=row["id"]).organization_id
            for row in response.data["results"]
        }
        self.assertTrue(organization_ids <= {self.alpha.id})

    def test_member_of_another_agency_cannot_be_modified(self):
        beta_membership = OrganizationMember.objects.get(user=self.beta_owner)
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.patch(
            agency_url(self.alpha, f"members/{beta_membership.id}/"),
            {"role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_suspended_agency_loses_access(self):
        Organization.objects.filter(pk=self.alpha.pk).update(status="suspended")
        self.client.force_authenticate(self.alpha_owner)
        for suffix in AGENCY_ENDPOINTS:
            self.assertEqual(
                self.client.get(agency_url(self.alpha, suffix)).status_code, 404, suffix
            )

    def test_disabled_member_loses_access(self):
        OrganizationMember.objects.filter(user=self.alpha_viewer).update(status="disabled")
        self.client.force_authenticate(self.alpha_viewer)
        self.assertEqual(
            self.client.get(agency_url(self.alpha, "dashboard/")).status_code, 404
        )


class ReferralPrivacyTests(AgencyScenario):
    """The agency must never learn who the platform's customer is."""

    def test_sales_payload_contains_no_customer_identity(self):
        self.client.force_authenticate(self.alpha_owner)
        body = self.client.get(agency_url(self.alpha, "sales/")).content.decode()
        self.assertNotIn("alpha-customer@example.com", body)
        self.assertNotIn("customer_email", body)

    def test_sales_payload_contains_no_esim_credentials(self):
        profile = EsimProfile.objects.get(order_item__order=self.alpha_order)
        credentials = esim_services.decrypt_credentials(profile)
        self.client.force_authenticate(self.alpha_owner)
        body = self.client.get(agency_url(self.alpha, "sales/")).content.decode()
        for secret in credentials.values():
            self.assertNotIn(secret, body)

    def test_no_agency_payload_exposes_wholesale_cost(self):
        self.client.force_authenticate(self.alpha_owner)
        for suffix in AGENCY_ENDPOINTS:
            body = self.client.get(agency_url(self.alpha, suffix)).content.decode()
            self.assertNotIn("wholesale", body, suffix)

    def test_sales_still_show_commercial_facts(self):
        """Privacy must not make the panel useless."""
        self.client.force_authenticate(self.alpha_owner)
        row = self.client.get(agency_url(self.alpha, "sales/")).data["results"][0]
        self.assertEqual(row["total_minor"], self.alpha_order.total_minor)
        self.assertEqual(row["commission_minor"], self.alpha_commission.commission_minor)
        self.assertEqual(row["promo_code_snapshot"], "ALPHA20")

    def test_there_is_no_agency_esim_endpoint(self):
        self.client.force_authenticate(self.alpha_owner)
        self.assertEqual(self.client.get(agency_url(self.alpha, "esims/")).status_code, 404)


class AgencyRoleTests(AgencyScenario):
    def test_viewer_can_read_dashboard_and_commissions(self):
        self.client.force_authenticate(self.alpha_viewer)
        for suffix in ("dashboard/", "commissions/", "payouts/", "reports/revenue/"):
            self.assertEqual(
                self.client.get(agency_url(self.alpha, suffix)).status_code, 200, suffix
            )

    def test_viewer_cannot_edit_the_profile(self):
        self.client.force_authenticate(self.alpha_viewer)
        response = self.client.patch(
            agency_url(self.alpha, "profile/"), {"name": "Hacked"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.alpha.refresh_from_db()
        self.assertEqual(self.alpha.name, "Alpha")

    def test_viewer_cannot_manage_staff(self):
        self.client.force_authenticate(self.alpha_viewer)
        response = self.client.post(
            agency_url(self.alpha, "members/"),
            {"email": "alpha-buyer@example.com", "role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_reach_the_activity_log(self):
        self.client.force_authenticate(self.alpha_viewer)
        self.assertEqual(
            self.client.get(agency_url(self.alpha, "activity/")).status_code, 403
        )

    def test_owner_can_edit_the_profile(self):
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.patch(
            agency_url(self.alpha, "profile/"),
            {"name": "Alpha Travel", "support_email": "help@alpha.com"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.alpha.refresh_from_db()
        self.assertEqual(self.alpha.name, "Alpha Travel")
        self.assertTrue(
            AuditEvent.objects.filter(action="organization.profile_updated").exists()
        )

    def test_agency_cannot_change_its_own_commission_rate(self):
        self.client.force_authenticate(self.alpha_owner)
        self.client.patch(
            agency_url(self.alpha, "profile/"),
            {"default_commission_value": 9000, "default_commission_type": "percentage_bps"},
            format="json",
        )
        self.alpha.refresh_from_db()
        self.assertIsNone(self.alpha.default_commission_value)

    def test_agency_cannot_change_its_own_status(self):
        self.client.force_authenticate(self.alpha_owner)
        self.client.patch(
            agency_url(self.alpha, "profile/"), {"status": "active"}, format="json"
        )
        self.alpha.refresh_from_db()
        self.assertEqual(self.alpha.status, "active")  # unchanged, not settable

    def test_admin_cannot_promote_anyone_to_owner(self):
        membership = OrganizationMember.objects.get(user=self.alpha_buyer)
        self.client.force_authenticate(self.alpha_admin)
        response = self.client.patch(
            agency_url(self.alpha, f"members/{membership.id}/"),
            {"role": "owner"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_manage_a_buyer(self):
        membership = OrganizationMember.objects.get(user=self.alpha_buyer)
        self.client.force_authenticate(self.alpha_admin)
        response = self.client.patch(
            agency_url(self.alpha, f"members/{membership.id}/"),
            {"role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_admin_cannot_modify_an_owner(self):
        owner_membership = OrganizationMember.objects.get(user=self.alpha_owner)
        self.client.force_authenticate(self.alpha_admin)
        response = self.client.patch(
            agency_url(self.alpha, f"members/{owner_membership.id}/"),
            {"status": "disabled"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_last_owner_is_protected_in_agency_scope(self):
        owner_membership = OrganizationMember.objects.get(user=self.alpha_owner)
        self.client.force_authenticate(self.alpha_owner)
        response = self.client.patch(
            agency_url(self.alpha, f"members/{owner_membership.id}/"),
            {"role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "last_owner_protected")


class AgencyDashboardTests(AgencyScenario):
    def test_dashboard_reports_attributed_sales_and_commission(self):
        self.client.force_authenticate(self.alpha_owner)
        data = self.client.get(agency_url(self.alpha, "dashboard/")).data
        self.assertEqual(data["attributed_sales"]["order_count"], 1)
        self.assertEqual(
            data["attributed_sales"]["total_minor"], self.alpha_order.total_minor
        )
        self.assertEqual(
            data["commissions"]["earned_minor"], self.alpha_commission.commission_minor
        )
        self.assertEqual(data["commissions"]["outstanding_minor"],
                         self.alpha_commission.commission_minor)

    def test_dashboard_excludes_other_agencies(self):
        self.client.force_authenticate(self.beta_owner)
        alpha_total = self.alpha_order.total_minor
        data = self.client.get(agency_url(self.beta, "dashboard/")).data
        self.assertEqual(data["attributed_sales"]["order_count"], 1)
        self.assertEqual(data["attributed_sales"]["total_minor"], self.beta_order.total_minor)
        # Beta's figures must not include Alpha's sale even though both exist.
        self.assertNotEqual(data["attributed_sales"]["total_minor"], alpha_total * 2)

    def test_dashboard_has_no_margin_block(self):
        self.client.force_authenticate(self.alpha_owner)
        self.assertNotIn("margin", self.client.get(agency_url(self.alpha, "dashboard/")).data)
