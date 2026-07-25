from datetime import date

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware
from django.test import RequestFactory, TestCase
from rest_framework.test import APITestCase

from apps.accounts import services
from apps.accounts.adapters import SocialAccountAdapter
from apps.accounts.models import Organization, OrganizationMember, PartnerCommission, User
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.orders import services as order_services
from apps.orders.models import PromoCode


def _plan(retail=2000):
    supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
    country = Country.objects.create(
        iso2="FR", name="France", slug="france", region="Europe", is_active=True
    )
    CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code="FR-5GB-30D",
        supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
        data_limit_mb=5000, validity_days=30, retail_amount_minor=retail,
        wholesale_amount_minor=retail // 2, currency="USD", status="active",
    )


class AuthAPITests(APITestCase):
    def test_register_login_me_logout_cycle(self):
        registered = self.client.post(
            "/api/v1/auth/register/",
            {"email": "u@e.com", "password": "str0ngPass!23"}, format="json",
        )
        self.assertEqual(registered.status_code, 201)
        self.assertEqual(registered.data["email"], "u@e.com")
        self.assertEqual(self.client.get("/api/v1/account/me/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/auth/logout/").status_code, 204)
        self.assertIn(self.client.get("/api/v1/account/me/").status_code, (401, 403))
        logged_in = self.client.post(
            "/api/v1/auth/login/",
            {"email": "u@e.com", "password": "str0ngPass!23"}, format="json",
        )
        self.assertEqual(logged_in.status_code, 200)

    def test_login_bad_credentials(self):
        User.objects.create_user(email="u@e.com", password="str0ngPass!23")
        response = self.client.post(
            "/api/v1/auth/login/", {"email": "u@e.com", "password": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "invalid_credentials")

    def test_weak_password_rejected(self):
        response = self.client.post(
            "/api/v1/auth/register/", {"email": "u@e.com", "password": "123"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_flow(self):
        from django.contrib.auth.tokens import default_token_generator
        from django.core import mail
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        user = User.objects.create_user(email="r@e.com", password="oldPass!23456")
        requested = self.client.post(
            "/api/v1/auth/password-reset/", {"email": "r@e.com"}, format="json"
        )
        self.assertEqual(requested.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        confirmed = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "newStr0ng!2345"},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200)

        logged_in = self.client.post(
            "/api/v1/auth/login/",
            {"email": "r@e.com", "password": "newStr0ng!2345"}, format="json",
        )
        self.assertEqual(logged_in.status_code, 200)

    def test_password_reset_confirm_rejects_bad_token(self):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        user = User.objects.create_user(email="r@e.com", password="oldPass!23456")
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        response = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"uid": uid, "token": "not-a-real-token", "new_password": "newStr0ng!2345"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_unknown_email_returns_200(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/", {"email": "nobody@e.com"}, format="json"
        )
        self.assertEqual(response.status_code, 200)


def _oauth_request():
    request = RequestFactory().get("/accounts/google/login/callback/")
    SessionMiddleware(lambda req: None).process_request(request)
    request.session.save()
    request.user = AnonymousUser()
    return request


class GoogleOAuthLinkingTests(TestCase):
    """The custom SocialAccountAdapter links Google logins to existing email accounts."""

    def _sociallogin(self, email, verified=True):
        account = SocialAccount(provider="google", uid="google-uid-1", extra_data={"email": email})
        sociallogin = SocialLogin(user=User(email=email), account=account)
        sociallogin.email_addresses = [EmailAddress(email=email, verified=verified, primary=True)]
        return sociallogin

    def test_links_google_to_existing_verified_email(self):
        existing = User.objects.create_user(email="dupe@example.com", password="pw-123456789")
        sociallogin = self._sociallogin("dupe@example.com", verified=True)
        SocialAccountAdapter().pre_social_login(_oauth_request(), sociallogin)
        self.assertEqual(sociallogin.user.pk, existing.pk)

    def test_does_not_link_when_provider_email_unverified(self):
        existing = User.objects.create_user(email="dupe@example.com", password="pw-123456789")
        sociallogin = self._sociallogin("dupe@example.com", verified=False)
        SocialAccountAdapter().pre_social_login(_oauth_request(), sociallogin)
        # not connected to the existing account, and the new user is not persisted
        self.assertNotEqual(sociallogin.user.pk, existing.pk)
        self.assertFalse(User.objects.filter(pk=sociallogin.user.pk).exists())

    def test_no_link_when_no_matching_account(self):
        sociallogin = self._sociallogin("brand-new@example.com", verified=True)
        SocialAccountAdapter().pre_social_login(_oauth_request(), sociallogin)
        self.assertFalse(User.objects.filter(pk=sociallogin.user.pk).exists())


class CommissionServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        _plan(retail=2000)
        cls.org = Organization.objects.create(
            name="Agency", organization_type="travel_agency",
            billing_email="a@agency.com", status="active",
        )

    def _agency_order(self, qty=1):
        PromoCode.objects.get_or_create(
            code="AGENCY10",
            defaults={
                "organization": self.org, "discount_type": "percentage_bps",
                "discount_value": 1000, "commission_type": "percentage_bps",
                "commission_value": 1500,
            },
        )
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=qty)
        return order_services.checkout(
            cart_id=cart.id, customer_email="a@b.com", promo_code="AGENCY10"
        )

    def test_commission_created_for_agency_order(self):
        order = self._agency_order(qty=1)  # subtotal 2000, 10% discount -> commissionable 1800
        self.assertEqual(order.referring_organization_id, self.org.id)
        commission = services.create_commission_for_order(order)
        self.assertEqual(commission.commissionable_minor, 1800)
        self.assertEqual(commission.commission_minor, 270)  # floor(1800 * 1500 / 10000)
        self.assertEqual(commission.status, "pending")

    def test_no_commission_without_agency_promo(self):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        self.assertIsNone(services.create_commission_for_order(order))

    def test_full_refund_reverses_commission(self):
        order = self._agency_order(qty=1)
        commission = services.create_commission_for_order(order)
        services.reverse_commission_for_order(order, order.subtotal_minor)
        commission.refresh_from_db()
        self.assertEqual(commission.reversed_minor, commission.commission_minor)
        self.assertEqual(commission.status, "reversed")

    def test_partial_refund_reverses_proportionally(self):
        order = self._agency_order(qty=2)  # subtotal 4000, commissionable 3600, commission 540
        commission = services.create_commission_for_order(order)
        self.assertEqual(commission.commission_minor, 540)
        services.reverse_commission_for_order(order, 2000)  # half of subtotal
        commission.refresh_from_db()
        self.assertEqual(commission.reversed_minor, 270)
        self.assertEqual(commission.status, "pending")

    def test_approve_and_payout(self):
        order = self._agency_order(qty=1)
        commission = services.approve_commission(services.create_commission_for_order(order))
        self.assertEqual(commission.status, "approved")
        payout = services.create_payout(
            self.org, period_start=date(2026, 7, 1), period_end=date(2026, 7, 31)
        )
        commission.refresh_from_db()
        self.assertEqual(commission.payout_id, payout.id)
        self.assertEqual(payout.amount_minor, 270)


class OrganizationAPITests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(
            name="Agency", organization_type="travel_agency",
            billing_email="a@agency.com", status="active",
        )
        self.member = User.objects.create_user(email="member@e.com", password="str0ngPass!23")
        self.outsider = User.objects.create_user(email="out@e.com", password="str0ngPass!23")
        OrganizationMember.objects.create(
            organization=self.org, user=self.member, role="owner", status="active"
        )

    def test_list_scoped_to_membership(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/v1/organizations/").data["count"], 1)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get("/api/v1/organizations/").data["count"], 0)

    def test_outsider_cannot_view_detail(self):
        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.get(f"/api/v1/organizations/{self.org.id}/").status_code, 404
        )

    def test_member_views_commissions_and_payouts(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.get(f"/api/v1/organizations/{self.org.id}/commissions/").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/organizations/{self.org.id}/payouts/").status_code, 200
        )

    def test_unauthenticated_denied(self):
        self.assertIn(self.client.get("/api/v1/organizations/").status_code, (401, 403))
