"""Structural permission sweep.

These tests enumerate the admin and agency routes **from the URLconf** rather than from a
hand-maintained list. That is deliberate: a new endpoint added without a capability, or
reachable by the wrong role, fails here automatically instead of waiting for someone to
remember to extend a checklist.
"""

import uuid

from django.test import override_settings
from django.urls import get_resolver
from django.urls.resolvers import URLPattern, URLResolver
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, OrganizationMember, User

from .test_admin_api import platform_user
from .test_tenancy import make_member, make_org

PLACEHOLDER = "11111111-1111-1111-1111-111111111111"


def _collect_routes(prefix):
    """Return concrete URLs (with placeholder ids) for every route under ``prefix``."""
    routes = []

    def walk(resolver, base=""):
        for pattern in resolver.url_patterns:
            if isinstance(pattern, URLResolver):
                walk(pattern, base + str(pattern.pattern))
            elif isinstance(pattern, URLPattern):
                route = base + str(pattern.pattern)
                if not route.startswith(prefix):
                    continue
                view_class = getattr(pattern.callback, "cls", None)
                if view_class is None:
                    continue
                routes.append((route, view_class))

    walk(get_resolver())
    return routes


def _concrete(route, organization_id=None):
    """Turn a URL pattern into a requestable path."""
    path = "/" + route
    for token in ("<uuid:id>", "<uuid:member_id>", "<uuid:organization_id>"):
        replacement = (
            str(organization_id)
            if token == "<uuid:organization_id>" and organization_id
            else PLACEHOLDER
        )
        path = path.replace(token, replacement)
    # Regex-based transition route.
    if "(?P<" in path:
        return None
    return path


ADMIN_ROUTES = _collect_routes("api/v1/admin/")
AGENCY_ROUTES = _collect_routes("api/v1/agency/")


class RouteRegistrationTests(APITestCase):
    """Structural guarantees about the admin surface itself."""

    def test_admin_and_agency_routes_exist(self):
        self.assertGreater(len(ADMIN_ROUTES), 15)
        self.assertGreater(len(AGENCY_ROUTES), 8)

    def test_every_admin_view_declares_a_capability(self):
        missing = [
            view.__name__ for _, view in ADMIN_ROUTES
            if not getattr(view, "required_capability", None)
        ]
        self.assertEqual(missing, [], f"admin views without required_capability: {missing}")

    def test_every_agency_view_declares_a_capability(self):
        missing = [
            view.__name__ for _, view in AGENCY_ROUTES
            if not getattr(view, "required_capability", None)
        ]
        self.assertEqual(missing, [], f"agency views without required_capability: {missing}")

    def test_admin_capabilities_are_platform_scoped(self):
        for _, view in ADMIN_ROUTES:
            capability = view.required_capability
            self.assertTrue(
                capability.startswith("platform."), f"{view.__name__}: {capability}"
            )

    def test_agency_capabilities_are_agency_scoped(self):
        for _, view in AGENCY_ROUTES:
            capability = view.required_capability
            self.assertTrue(
                capability.startswith("agency."), f"{view.__name__}: {capability}"
            )

    def test_no_admin_or_agency_view_allows_anonymous_access(self):
        from rest_framework.permissions import AllowAny

        for _, view in ADMIN_ROUTES + AGENCY_ROUTES:
            self.assertNotIn(
                AllowAny, getattr(view, "permission_classes", []), view.__name__
            )


class AdminSurfaceDenialTests(APITestCase):
    """Nobody without a platform role may touch any admin route."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email="cust@example.com", password="pw-123456789"
        )
        self.agency_owner = make_member(make_org("Alpha"), "ao@example.com", "owner")

    def test_customer_is_denied_every_admin_route(self):
        self.client.force_authenticate(self.customer)
        for route, view in ADMIN_ROUTES:
            path = _concrete(route)
            if path is None:
                continue
            for method in ("get", "post", "patch", "delete"):
                response = getattr(self.client, method)(path)
                self.assertNotEqual(response.status_code, 200, f"{method} {path}")
                self.assertIn(
                    response.status_code, (401, 403, 404, 405), f"{method} {path}"
                )

    def test_agency_user_is_denied_every_admin_route(self):
        self.client.force_authenticate(self.agency_owner)
        for route, view in ADMIN_ROUTES:
            path = _concrete(route)
            if path is None:
                continue
            response = self.client.get(path)
            self.assertNotEqual(response.status_code, 200, path)

    def test_anonymous_is_denied_every_admin_route(self):
        for route, view in ADMIN_ROUTES:
            path = _concrete(route)
            if path is None:
                continue
            response = self.client.get(path)
            self.assertNotEqual(response.status_code, 200, path)


@override_settings(SUPPLIER_GATEWAY="fake")
class AgencySurfaceIsolationTests(APITestCase):
    """Every agency route must be invisible across tenants."""

    def setUp(self):
        self.alpha = make_org("Alpha")
        self.beta = make_org("Beta")
        self.alpha_owner = make_member(self.alpha, "alpha@example.com", "owner")
        self.beta_owner = make_member(self.beta, "beta@example.com", "owner")
        self.platform_admin = platform_user("root@example.com", superuser=True)
        self.customer = User.objects.create_user(
            email="cust@example.com", password="pw-123456789"
        )

    def _agency_paths(self, organization):
        paths = []
        for route, _ in AGENCY_ROUTES:
            path = _concrete(route, organization_id=organization.id)
            if path:
                paths.append(path)
        return paths

    def test_other_tenant_gets_404_on_every_route(self):
        self.client.force_authenticate(self.beta_owner)
        for path in self._agency_paths(self.alpha):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_customer_without_membership_gets_404_on_every_route(self):
        self.client.force_authenticate(self.customer)
        for path in self._agency_paths(self.alpha):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_platform_admin_is_not_automatically_an_agency_member(self):
        """Platform power does not silently grant tenant membership."""
        self.client.force_authenticate(self.platform_admin)
        for path in self._agency_paths(self.alpha):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_member_reaches_its_own_tenant(self):
        self.client.force_authenticate(self.alpha_owner)
        for path in self._agency_paths(self.alpha):
            self.assertIn(self.client.get(path).status_code, (200, 405), path)

    def test_no_agency_route_leaks_forbidden_fields(self):
        """Sweep every agency response for platform-only data."""
        forbidden = (
            "wholesale", "supplier_package_code", "supplier_metadata",
            "iccid_encrypted", "qr_payload", "activation_code", "smdp",
        )
        self.client.force_authenticate(self.alpha_owner)
        for path in self._agency_paths(self.alpha):
            response = self.client.get(path)
            if response.status_code != 200:
                continue
            body = response.content.decode().lower()
            for token in forbidden:
                self.assertNotIn(token, body, f"{token} leaked at {path}")
