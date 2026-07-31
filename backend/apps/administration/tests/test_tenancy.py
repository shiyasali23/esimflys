from django.test import TestCase, override_settings

from apps.accounts.models import Organization, OrganizationMember, User
from apps.administration import tenancy
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile
from apps.orders import services as order_services
from apps.orders.models import Order


def make_org(name, status="active"):
    return Organization.objects.create(
        name=name, organization_type="travel_agency",
        billing_email=f"{name.lower()}@example.com", status=status,
    )


def make_member(org, email, role="owner", status="active"):
    user = User.objects.create_user(email=email, password="pw-123456789")
    OrganizationMember.objects.create(
        organization=org, user=user, role=role, status=status
    )
    return user


class ResolveTenantTests(TestCase):
    def setUp(self):
        self.org = make_org("Alpha")
        self.other = make_org("Beta")
        self.user = make_member(self.org, "alpha-owner@example.com")

    def test_active_member_of_active_org_resolves(self):
        org, membership = tenancy.resolve_tenant(self.user, self.org.id)
        self.assertEqual(org.id, self.org.id)
        self.assertEqual(membership.role, "owner")

    def test_non_member_is_rejected(self):
        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(self.user, self.other.id)

    def test_disabled_membership_is_rejected(self):
        OrganizationMember.objects.filter(user=self.user).update(status="disabled")
        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(self.user, self.org.id)

    def test_invited_membership_is_rejected(self):
        OrganizationMember.objects.filter(user=self.user).update(status="invited")
        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(self.user, self.org.id)

    def test_suspended_organization_is_rejected(self):
        Organization.objects.filter(pk=self.org.pk).update(status="suspended")
        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(self.user, self.org.id)

    def test_pending_organization_is_rejected(self):
        Organization.objects.filter(pk=self.org.pk).update(status="pending")
        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(self.user, self.org.id)

    def test_anonymous_is_rejected(self):
        from django.contrib.auth.models import AnonymousUser

        with self.assertRaises(tenancy.TenantNotFound):
            tenancy.resolve_tenant(AnonymousUser(), self.org.id)

    def test_rejection_uses_404_not_403(self):
        """403 would confirm that another tenant's organization exists."""
        try:
            tenancy.resolve_tenant(self.user, self.other.id)
        except tenancy.TenantNotFound as exc:
            self.assertEqual(exc.status_code, 404)
            self.assertEqual(exc.error_code, "not_found")

    def test_member_organizations_excludes_other_tenants(self):
        self.assertEqual(
            list(tenancy.member_organizations(self.user).values_list("id", flat=True)),
            [self.org.id],
        )


@override_settings(SUPPLIER_GATEWAY="fake")
class BuyerVersusReferralIsolationTests(TestCase):
    """The single most important isolation rule (plan §8.2)."""

    def setUp(self):
        self.agency = make_org("Agency")
        supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="FR-5GB-30D",
            supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            currency="USD", status="active",
        )
        self.buyer_order = self._order("agency-customer@example.com")
        self.buyer_order.buyer_organization = self.agency
        self.buyer_order.save(update_fields=["buyer_organization"])

        self.referral_order = self._order("retail-customer@example.com")
        self.referral_order.referring_organization = self.agency
        self.referral_order.save(update_fields=["referring_organization"])

    def _order(self, email):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        return order_services.checkout(cart_id=cart.id, customer_email=email)

    def test_buyer_queryset_returns_only_owned_orders(self):
        ids = set(tenancy.agency_orders(self.agency).values_list("id", flat=True))
        self.assertEqual(ids, {self.buyer_order.id})
        self.assertNotIn(self.referral_order.id, ids)

    def test_referral_queryset_returns_only_referred_orders(self):
        ids = set(tenancy.agency_referral_orders(self.agency).values_list("id", flat=True))
        self.assertEqual(ids, {self.referral_order.id})

    def test_referral_customer_pii_is_not_reachable_via_the_buyer_queryset(self):
        emails = set(tenancy.agency_orders(self.agency).values_list("customer_email", flat=True))
        self.assertNotIn("retail-customer@example.com", emails)

    def test_esim_credentials_scope_excludes_referral_orders(self):
        for order in (self.buyer_order, self.referral_order):
            esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        self.assertEqual(EsimProfile.objects.count(), 2)

        visible = tenancy.agency_esim_profiles(self.agency)
        self.assertEqual(visible.count(), 1)
        self.assertEqual(visible.first().order_item.order_id, self.buyer_order.id)

    def test_queryset_helpers_are_separate_methods(self):
        """Guards against someone 'simplifying' the two querysets into one OR filter."""
        self.assertTrue(hasattr(Order.objects, "for_agency_buyer"))
        self.assertTrue(hasattr(Order.objects, "for_agency_referral"))
        combined = set(tenancy.agency_orders(self.agency)) | set(
            tenancy.agency_referral_orders(self.agency)
        )
        self.assertEqual(len(combined), 2)
        self.assertEqual(tenancy.agency_orders(self.agency).count(), 1)
