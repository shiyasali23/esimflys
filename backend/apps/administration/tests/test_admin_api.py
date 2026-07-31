from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, OrganizationMember, User
from apps.administration.models import AuditEvent
from apps.orders.models import PromoCode

ADMIN = "/api/v1/admin"


def platform_user(email, group=None, superuser=False):
    if superuser:
        return User.objects.create_superuser(email=email, password="pw-123456789")
    user = User.objects.create_user(email=email, password="pw-123456789", is_staff=True)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class AdminAccessControlTests(APITestCase):
    """Who may reach the platform admin API at all."""

    def setUp(self):
        self.org = Organization.objects.create(
            name="Alpha", organization_type="travel_agency",
            billing_email="a@a.com", status="pending",
        )
        self.superuser = platform_user("root@example.com", superuser=True)
        self.platform_admin = platform_user("pa@example.com", "platform_admin")
        self.support = platform_user("support@example.com", "support_admin")
        self.finance = platform_user("finance@example.com", "finance_admin")
        self.readonly = platform_user("ro@example.com", "readonly_admin")
        self.customer = User.objects.create_user(
            email="cust@example.com", password="pw-123456789"
        )
        self.bare_staff = User.objects.create_user(
            email="bare@example.com", password="pw-123456789", is_staff=True
        )

    def test_anonymous_is_denied(self):
        self.assertIn(self.client.get(f"{ADMIN}/organizations/").status_code, (401, 403))

    def test_customer_is_denied(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(f"{ADMIN}/organizations/").status_code, 403)

    def test_bare_is_staff_is_denied(self):
        """Django-admin access must not imply platform API access."""
        self.client.force_authenticate(self.bare_staff)
        self.assertEqual(self.client.get(f"{ADMIN}/organizations/").status_code, 403)

    def test_superuser_and_platform_admin_may_manage_agencies(self):
        for user in (self.superuser, self.platform_admin):
            self.client.force_authenticate(user)
            self.assertEqual(
                self.client.get(f"{ADMIN}/organizations/").status_code, 200, user.email
            )

    def test_support_and_finance_cannot_manage_agencies(self):
        for user in (self.support, self.finance, self.readonly):
            self.client.force_authenticate(user)
            self.assertEqual(
                self.client.get(f"{ADMIN}/organizations/").status_code, 403, user.email
            )

    def test_readonly_admin_may_view_the_audit_trail(self):
        self.client.force_authenticate(self.readonly)
        self.assertEqual(self.client.get(f"{ADMIN}/audit-events/").status_code, 200)

    def test_audit_trail_is_read_only(self):
        self.client.force_authenticate(self.superuser)
        for method in (self.client.post, self.client.delete, self.client.patch):
            response = method(f"{ADMIN}/audit-events/", {}, format="json")
            self.assertEqual(response.status_code, 405)


class OrganizationLifecycleTests(APITestCase):
    def setUp(self):
        self.admin = platform_user("root@example.com", superuser=True)
        self.client.force_authenticate(self.admin)
        self.org = Organization.objects.create(
            name="Alpha", organization_type="travel_agency",
            billing_email="a@a.com", status="pending",
        )

    def test_create_returns_the_new_id_and_defaults_to_pending(self):
        response = self.client.post(
            f"{ADMIN}/organizations/",
            {"name": "Beta", "organization_type": "travel_agency",
             "billing_email": "b@b.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["status"], "pending")
        # The returned id must actually address the resource.
        follow_up = self.client.get(f"{ADMIN}/organizations/{response.data['id']}/")
        self.assertEqual(follow_up.status_code, 200)
        self.assertTrue(AuditEvent.objects.filter(action="organization.created").exists())

    def test_new_organization_cannot_trade_until_approved(self):
        response = self.client.post(
            f"{ADMIN}/organizations/",
            {"name": "Gamma", "organization_type": "travel_agency",
             "billing_email": "g@g.com"},
            format="json",
        )
        organization = Organization.objects.get(pk=response.data["id"])
        self.assertFalse(organization.is_operational)

    def test_approve_moves_pending_to_active_and_records_approver(self):
        response = self.client.post(f"{ADMIN}/organizations/{self.org.id}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "active")
        self.assertIsNotNone(self.org.approved_at)
        self.assertEqual(self.org.approved_by_id, self.admin.id)
        self.assertTrue(AuditEvent.objects.filter(action="organization.active").exists())

    def test_suspend_requires_a_reason(self):
        self.client.post(f"{ADMIN}/organizations/{self.org.id}/approve/", {}, format="json")
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/suspend/", {}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_suspend_then_reactivate(self):
        self.client.post(f"{ADMIN}/organizations/{self.org.id}/approve/", {}, format="json")
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/suspend/",
            {"reason": "fraud review"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "suspended")
        self.assertEqual(self.org.suspension_reason, "fraud review")

        self.client.post(f"{ADMIN}/organizations/{self.org.id}/activate/", {}, format="json")
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "active")
        self.assertIsNone(self.org.suspension_reason)

    def test_illegal_transition_is_rejected(self):
        """pending -> suspended is not a legal move."""
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/suspend/",
            {"reason": "nope"}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "invalid_status_transition")
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "pending")

    def test_closed_is_terminal(self):
        self.client.post(f"{ADMIN}/organizations/{self.org.id}/close/", {}, format="json")
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "closed")
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 409)

    def test_status_cannot_be_changed_by_a_bare_patch(self):
        """Status moves only through the lifecycle service."""
        response = self.client.patch(
            f"{ADMIN}/organizations/{self.org.id}/", {"status": "active"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.org.refresh_from_db()
        self.assertEqual(self.org.status, "pending")

    def test_update_is_audited_with_a_diff(self):
        self.client.patch(
            f"{ADMIN}/organizations/{self.org.id}/", {"name": "Alpha Renamed"}, format="json"
        )
        event = AuditEvent.objects.get(action="organization.updated")
        self.assertEqual(event.changes["name"], ["Alpha", "Alpha Renamed"])


class OrganizationMemberAPITests(APITestCase):
    def setUp(self):
        self.admin = platform_user("root@example.com", superuser=True)
        self.client.force_authenticate(self.admin)
        self.org = Organization.objects.create(
            name="Alpha", organization_type="travel_agency",
            billing_email="a@a.com", status="active",
        )
        self.owner_user = User.objects.create_user(
            email="owner@example.com", password="pw-123456789"
        )
        self.owner = OrganizationMember.objects.create(
            organization=self.org, user=self.owner_user, role="owner", status="active"
        )
        self.staff_user = User.objects.create_user(
            email="staff@example.com", password="pw-123456789"
        )

    def test_add_member(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "staff@example.com", "role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], "viewer")
        self.assertTrue(AuditEvent.objects.filter(action="organization_member.added").exists())

    def test_creating_a_new_agency_login_requires_a_password(self):
        """Agencies do not self-register, so onboarding must supply the credential."""
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "ghost@example.com", "role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data["error"]["fields"])

    def test_admin_creates_the_agency_login_and_it_works(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "newagent@example.com", "role": "owner",
             "password": "AgencyPass!2345", "first_name": "Ava"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["login_created"])

        created = User.objects.get(email="newagent@example.com")
        self.assertTrue(created.check_password("AgencyPass!2345"))
        self.assertTrue(AuditEvent.objects.filter(action="user.created_by_admin").exists())

        # The credential actually logs in.
        self.client.logout()
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": "newagent@example.com", "password": "AgencyPass!2345"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_created_agency_login_never_gets_django_admin_access(self):
        """is_staff would expose every tenant — Django admin has no row-level tenancy."""
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "newagent@example.com", "role": "owner", "password": "AgencyPass!2345"},
            format="json",
        )
        created = User.objects.get(email="newagent@example.com")
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)

    def test_weak_agency_password_is_rejected(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "weak@example.com", "role": "viewer", "password": "123"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="weak@example.com").exists())

    def test_existing_user_is_attached_without_a_password(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "staff@example.com", "role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["login_created"])

    def test_admin_can_reset_an_agency_password(self):
        add = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "reset@example.com", "role": "owner", "password": "FirstPass!2345"},
            format="json",
        )
        member_id = add.data["id"]
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/{member_id}/set-password/",
            {"password": "SecondPass!2345"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="reset@example.com")
        self.assertTrue(user.check_password("SecondPass!2345"))
        self.assertFalse(user.check_password("FirstPass!2345"))
        self.assertTrue(
            AuditEvent.objects.filter(action="user.password_reset_by_admin").exists()
        )

    def test_password_never_appears_in_the_audit_trail(self):
        secret = "NeverLogged!2345"
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "audited@example.com", "role": "viewer", "password": secret},
            format="json",
        )
        import json as _json

        blob = _json.dumps(list(AuditEvent.objects.values("changes", "context", "object_repr")))
        self.assertNotIn(secret, blob)

    def test_password_reset_is_denied_to_roles_without_agency_management(self):
        add = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "victim@example.com", "role": "owner", "password": "FirstPass!2345"},
            format="json",
        )
        self.client.force_authenticate(platform_user("sup2@example.com", "support_admin"))
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/{add.data['id']}/set-password/",
            {"password": "Hijack!2345"}, format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_duplicate_member_is_rejected(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/members/",
            {"email": "owner@example.com", "role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_role_change_is_audited(self):
        membership = OrganizationMember.objects.create(
            organization=self.org, user=self.staff_user, role="viewer", status="active"
        )
        response = self.client.patch(
            f"{ADMIN}/organizations/{self.org.id}/members/{membership.id}/",
            {"role": "admin"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        event = AuditEvent.objects.get(action="organization_member.role_changed")
        self.assertEqual(event.changes["role"], ["viewer", "admin"])

    def test_last_owner_cannot_be_demoted(self):
        response = self.client.patch(
            f"{ADMIN}/organizations/{self.org.id}/members/{self.owner.id}/",
            {"role": "viewer"}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "last_owner_protected")

    def test_last_owner_cannot_be_disabled_or_removed(self):
        disable = self.client.patch(
            f"{ADMIN}/organizations/{self.org.id}/members/{self.owner.id}/",
            {"status": "disabled"}, format="json",
        )
        self.assertEqual(disable.status_code, 409)
        delete = self.client.delete(
            f"{ADMIN}/organizations/{self.org.id}/members/{self.owner.id}/"
        )
        self.assertEqual(delete.status_code, 409)

    def test_owner_can_be_removed_once_a_second_owner_exists(self):
        OrganizationMember.objects.create(
            organization=self.org, user=self.staff_user, role="owner", status="active"
        )
        response = self.client.delete(
            f"{ADMIN}/organizations/{self.org.id}/members/{self.owner.id}/"
        )
        self.assertEqual(response.status_code, 204)

    def test_member_of_another_organization_is_not_reachable(self):
        other = Organization.objects.create(
            name="Beta", organization_type="travel_agency",
            billing_email="b@b.com", status="active",
        )
        response = self.client.patch(
            f"{ADMIN}/organizations/{other.id}/members/{self.owner.id}/",
            {"role": "admin"}, format="json",
        )
        self.assertEqual(response.status_code, 404)


class TrackingCodeAPITests(APITestCase):
    def setUp(self):
        self.admin = platform_user("root@example.com", superuser=True)
        self.client.force_authenticate(self.admin)
        self.org = Organization.objects.create(
            name="Sunrise", organization_type="travel_agency",
            billing_email="s@s.com", status="active",
        )

    def test_issue_tracking_code_defaults_to_20_percent_and_no_discount(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "SUNRISE"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["kind"], "tracking")
        self.assertEqual(response.data["commission_value"], 2000)

        promo = PromoCode.objects.get(code="SUNRISE")
        self.assertEqual(promo.discount_value, 0)
        self.assertEqual(promo.organization_id, self.org.id)

    def test_response_never_exposes_discount_fields(self):
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "NO-DISCOUNT-FIELDS"}, format="json",
        )
        for field in ("discount_type", "discount_value", "maximum_discount_minor"):
            self.assertNotIn(field, response.data)

    def test_discount_cannot_be_injected_through_the_api(self):
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "SNEAKY", "commission_bps": 2000,
             "discount_type": "percentage_bps", "discount_value": 5000},
            format="json",
        )
        self.assertEqual(PromoCode.objects.get(code="SNEAKY").discount_value, 0)

    def test_duplicate_code_is_rejected(self):
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "DUPE"}, format="json",
        )
        response = self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "DUPE"}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_commission_rate_is_bounded(self):
        for bad in (0, 10001, -5):
            response = self.client.post(
                f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
                {"code": f"BAD{bad}", "commission_bps": bad}, format="json",
            )
            self.assertEqual(response.status_code, 400, bad)

    def test_issuing_is_audited(self):
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "AUDIT-ME"}, format="json",
        )
        event = AuditEvent.objects.get(action="promo_code.tracking_issued")
        self.assertEqual(event.organization_id, self.org.id)
        self.assertEqual(event.actor_id, self.admin.id)

    def test_list_shows_redemption_count(self):
        self.client.post(
            f"{ADMIN}/organizations/{self.org.id}/tracking-codes/",
            {"code": "COUNTED"}, format="json",
        )
        response = self.client.get(f"{ADMIN}/organizations/{self.org.id}/tracking-codes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["redemption_count"], 0)
