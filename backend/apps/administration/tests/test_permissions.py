from django.contrib.auth.models import Group
from django.core.exceptions import ImproperlyConfigured
from django.test import RequestFactory, TestCase

from apps.accounts.models import MEMBER_ROLES, User
from apps.administration import roles
from apps.administration.permissions import (
    HasAgencyCapability,
    HasPlatformCapability,
    IsAgencyMember,
    IsPlatformAdmin,
    can_assign_role,
)
from apps.administration.tenancy import TenantNotFound

from .test_tenancy import make_member, make_org


class _View:
    """Minimal stand-in for a DRF view."""

    def __init__(self, capability=None, kwargs=None):
        self.required_capability = capability
        self.kwargs = kwargs or {}


class RoleMatrixTests(TestCase):
    def test_definitions_are_self_consistent(self):
        self.assertTrue(roles.check_role_definitions())

    def test_matrix_covers_every_member_role(self):
        self.assertEqual(set(roles.AGENCY_ROLE_CAPABILITIES), set(MEMBER_ROLES))

    def test_viewer_is_read_only(self):
        viewer = roles.agency_capabilities("viewer")
        for capability in (
            roles.CREATE_ORDERS, roles.MANAGE_STAFF, roles.MANAGE_PROFILE,
            roles.MANAGE_CUSTOMERS, roles.REQUEST_REFUNDS, roles.MANAGE_PRICING,
            roles.VIEW_CREDENTIALS,
        ):
            self.assertNotIn(capability, viewer, capability)

    def test_buyer_cannot_manage_staff_or_request_refunds(self):
        buyer = roles.agency_capabilities("buyer")
        self.assertNotIn(roles.MANAGE_STAFF, buyer)
        self.assertNotIn(roles.REQUEST_REFUNDS, buyer)
        self.assertIn(roles.CREATE_ORDERS, buyer)

    def test_only_owner_manages_pricing(self):
        for role in MEMBER_ROLES:
            expected = role == "owner"
            self.assertEqual(
                roles.has_agency_capability(role, roles.MANAGE_PRICING), expected, role
            )

    def test_no_agency_role_can_touch_commission_rates_or_refunds(self):
        for role in MEMBER_ROLES:
            capabilities = roles.agency_capabilities(role)
            self.assertNotIn(roles.MANAGE_COMMISSION, capabilities)
            self.assertNotIn(roles.MANAGE_REFUND, capabilities)

    def test_unknown_role_has_no_capabilities(self):
        self.assertEqual(roles.agency_capabilities("superadmin"), frozenset())


class PrivilegeEscalationTests(TestCase):
    def test_role_cannot_grant_its_own_or_higher_rank(self):
        self.assertFalse(can_assign_role("admin", "admin"))
        self.assertFalse(can_assign_role("admin", "owner"))
        self.assertFalse(can_assign_role("buyer", "admin"))
        self.assertFalse(can_assign_role("viewer", "viewer"))

    def test_role_can_grant_strictly_lower_ranks(self):
        self.assertTrue(can_assign_role("owner", "admin"))
        self.assertTrue(can_assign_role("owner", "viewer"))
        self.assertTrue(can_assign_role("admin", "buyer"))

    def test_unknown_roles_are_rejected(self):
        self.assertFalse(can_assign_role("owner", "root"))
        self.assertFalse(can_assign_role("root", "viewer"))


class PlatformPermissionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.customer = User.objects.create_user(
            email="cust@example.com", password="pw-123456789"
        )
        self.superuser = User.objects.create_superuser(
            email="root@example.com", password="pw-123456789"
        )
        self.finance = User.objects.create_user(
            email="fin@example.com", password="pw-123456789", is_staff=True
        )
        self.finance.groups.add(Group.objects.create(name="finance_admin"))
        self.support = User.objects.create_user(
            email="sup@example.com", password="pw-123456789", is_staff=True
        )
        self.support.groups.add(Group.objects.create(name="support_admin"))

    def _request(self, user):
        request = self.factory.get("/api/v1/admin/orders/")
        request.user = user
        return request

    def test_customer_is_not_a_platform_admin(self):
        self.assertFalse(
            IsPlatformAdmin().has_permission(self._request(self.customer), _View())
        )

    def test_roled_users_are_platform_admins(self):
        for user in (self.superuser, self.finance, self.support):
            self.assertTrue(
                IsPlatformAdmin().has_permission(self._request(user), _View()), user.email
            )

    def test_superuser_holds_every_capability(self):
        for capability in (
            roles.MANAGE_REFUND, roles.MANAGE_ROLES, roles.MANAGE_SETTINGS,
            roles.REVEAL_CREDENTIALS,
        ):
            self.assertTrue(
                HasPlatformCapability().has_permission(
                    self._request(self.superuser), _View(capability)
                ), capability,
            )

    def test_support_cannot_refund_or_change_pricing(self):
        for capability in (roles.MANAGE_REFUND, roles.MANAGE_PLATFORM_PRICING,
                           roles.MANAGE_ROLES, roles.MANAGE_SETTINGS):
            self.assertFalse(
                HasPlatformCapability().has_permission(
                    self._request(self.support), _View(capability)
                ), capability,
            )

    def test_finance_can_refund_but_not_manage_roles(self):
        self.assertTrue(
            HasPlatformCapability().has_permission(
                self._request(self.finance), _View(roles.MANAGE_REFUND)
            )
        )
        self.assertFalse(
            HasPlatformCapability().has_permission(
                self._request(self.finance), _View(roles.MANAGE_ROLES)
            )
        )

    def test_only_superuser_manages_roles_and_settings(self):
        for capability in (roles.MANAGE_ROLES, roles.MANAGE_SETTINGS):
            for user in (self.finance, self.support):
                self.assertFalse(
                    HasPlatformCapability().has_permission(
                        self._request(user), _View(capability)
                    ), f"{user.email}/{capability}",
                )

    def test_is_staff_alone_grants_nothing(self):
        """A bare is_staff user has Django-admin access but no platform capability."""
        bare = User.objects.create_user(
            email="bare@example.com", password="pw-123456789", is_staff=True
        )
        self.assertFalse(IsPlatformAdmin().has_permission(self._request(bare), _View()))
        self.assertFalse(
            HasPlatformCapability().has_permission(
                self._request(bare), _View(roles.VIEW_ORDER)
            )
        )

    def test_missing_capability_declaration_fails_loudly(self):
        with self.assertRaises(ImproperlyConfigured):
            HasPlatformCapability().has_permission(self._request(self.superuser), _View())


class AgencyPermissionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.org = make_org("Alpha")
        self.other_org = make_org("Beta")
        self.owner = make_member(self.org, "owner@example.com", role="owner")
        self.viewer = make_member(self.org, "viewer@example.com", role="viewer")
        self.outsider = make_member(self.other_org, "outsider@example.com", role="owner")

    def _request(self, user):
        request = self.factory.get("/x/")
        request.user = user
        return request

    def _resolve(self, user, organization):
        request = self._request(user)
        view = _View(kwargs={"organization_id": organization.id})
        IsAgencyMember().has_permission(request, view)
        return request

    def test_member_resolution_attaches_tenant(self):
        request = self._resolve(self.owner, self.org)
        self.assertEqual(request.tenant.id, self.org.id)
        self.assertEqual(request.membership.role, "owner")

    def test_outsider_gets_tenant_not_found(self):
        view = _View(kwargs={"organization_id": self.org.id})
        with self.assertRaises(TenantNotFound):
            IsAgencyMember().has_permission(self._request(self.outsider), view)

    def test_missing_organization_id_fails_loudly(self):
        with self.assertRaises(ImproperlyConfigured):
            IsAgencyMember().has_permission(self._request(self.owner), _View())

    def test_capability_is_enforced_per_role(self):
        owner_request = self._resolve(self.owner, self.org)
        viewer_request = self._resolve(self.viewer, self.org)
        view = _View(roles.CREATE_ORDERS, kwargs={"organization_id": self.org.id})

        self.assertTrue(HasAgencyCapability().has_permission(owner_request, view))
        self.assertFalse(HasAgencyCapability().has_permission(viewer_request, view))

    def test_capability_denied_without_prior_tenant_resolution(self):
        request = self._request(self.owner)
        view = _View(roles.VIEW_DASHBOARD, kwargs={"organization_id": self.org.id})
        self.assertFalse(HasAgencyCapability().has_permission(request, view))

    def test_agency_view_missing_capability_fails_loudly(self):
        request = self._resolve(self.owner, self.org)
        with self.assertRaises(ImproperlyConfigured):
            HasAgencyCapability().has_permission(
                request, _View(kwargs={"organization_id": self.org.id})
            )
