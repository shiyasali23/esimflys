import json

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import Organization, PartnerCommission, User
from apps.accounts.services import create_agency_tracking_code, create_commission_for_order
from apps.administration.models import AuditEvent
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile, SupplierEvent
from apps.orders import services as order_services
from apps.orders.models import Notification, Order, PromoRedemption
from apps.payments.models import Payment, Refund

from .test_admin_api import platform_user

ADMIN = "/api/v1/admin"


def build_catalogue():
    supplier = Supplier.objects.create(
        code="esim-access", name="eSIM Access", status="active"
    )
    country = Country.objects.create(
        iso2="FR", name="France", slug="france", region="Europe", is_active=True
    )
    CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code="FR-5GB-30D",
        supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
        data_limit_mb=5000, validity_days=30, retail_amount_minor=2000,
        wholesale_amount_minor=800, currency="USD", status="active",
    )
    return supplier, country


def place_order(email="buyer@example.com", quantity=1, promo=None, user=None):
    cart, _ = order_services.create_cart(user=user)
    order_services.add_item(cart, product_code="FR-5GB-30D", quantity=quantity)
    return order_services.checkout(
        cart_id=cart.id, customer_email=email, promo_code=promo, user=user
    )


def settle(order):
    """Mark an order paid the way the webhook would, and provision its eSIMs."""
    payment = Payment.objects.create(
        order=order, provider="stripe", provider_payment_id=f"pi_{order.order_number}",
        idempotency_key=f"pi:{order.id}", amount_minor=order.total_minor,
        currency=order.currency, status="succeeded",
    )
    order.payment_status = "paid"
    order.status = "paid"
    order.save(update_fields=["payment_status", "status"])
    esim_services.enqueue_provisioning_for_order(order)
    while esim_services.claim_and_process_one():
        pass
    return payment


@override_settings(SUPPLIER_GATEWAY="fake")
class DashboardTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.superuser = platform_user("root@example.com", superuser=True)
        self.finance = platform_user("fin@example.com", "finance_admin")
        self.readonly = platform_user("ro@example.com", "readonly_admin")
        self.order = place_order(quantity=2)  # 2 x 2000 = 4000
        settle(self.order)

    def test_dashboard_reports_revenue_and_orders(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(f"{ADMIN}/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["revenue"]["gross_minor"], 4000)
        self.assertEqual(response.data["revenue"]["net_minor"], 4000)
        self.assertEqual(response.data["orders"]["paid"], 1)
        self.assertEqual(response.data["esims"]["live"], 2)

    def test_margin_is_only_exposed_to_a_pricing_capable_role(self):
        self.client.force_authenticate(self.superuser)
        self.assertIn("margin", self.client.get(f"{ADMIN}/dashboard/").data)
        # finance and readonly lack MANAGE_PLATFORM_PRICING
        for user in (self.finance, self.readonly):
            self.client.force_authenticate(user)
            response = self.client.get(f"{ADMIN}/dashboard/")
            self.assertEqual(response.status_code, 200, user.email)
            self.assertNotIn("margin", response.data, user.email)

    def test_margin_maths(self):
        self.client.force_authenticate(self.superuser)
        margin = self.client.get(f"{ADMIN}/dashboard/").data["margin"]
        self.assertEqual(margin["retail_minor"], 4000)
        self.assertEqual(margin["wholesale_minor"], 1600)
        self.assertEqual(margin["margin_minor"], 2400)

    def test_dashboard_query_count_does_not_grow_with_data(self):
        """The real N+1 guard: query count must be independent of row count."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.client.force_authenticate(self.superuser)
        with CaptureQueriesContext(connection) as small:
            self.client.get(f"{ADMIN}/dashboard/")

        for _ in range(5):
            settle(place_order())

        with CaptureQueriesContext(connection) as large:
            self.client.get(f"{ADMIN}/dashboard/")

        self.assertEqual(len(small), len(large))
        self.assertLess(len(large), 25)

    def test_refund_reduces_net_revenue(self):
        payment = Payment.objects.get(order=self.order)
        Refund.objects.create(
            payment=payment, provider="stripe", idempotency_key="r1",
            amount_minor=1000, currency="USD", status="succeeded",
        )
        self.client.force_authenticate(self.superuser)
        revenue = self.client.get(f"{ADMIN}/dashboard/").data["revenue"]
        self.assertEqual(revenue["gross_minor"], 4000)
        self.assertEqual(revenue["refunded_minor"], 1000)
        self.assertEqual(revenue["net_minor"], 3000)


@override_settings(SUPPLIER_GATEWAY="fake")
class OrderCustomerPaymentTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.superuser = platform_user("root@example.com", superuser=True)
        self.customer = User.objects.create_user(
            email="cust@example.com", password="pw-123456789"
        )
        self.order = place_order(email="cust@example.com", user=self.customer)
        settle(self.order)
        self.client.force_authenticate(self.superuser)

    def test_order_list_and_filters(self):
        response = self.client.get(f"{ADMIN}/orders/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            self.client.get(f"{ADMIN}/orders/?payment_status=paid").data["count"], 1
        )
        self.assertEqual(
            self.client.get(f"{ADMIN}/orders/?payment_status=pending").data["count"], 0
        )
        self.assertEqual(
            self.client.get(f"{ADMIN}/orders/?search={self.order.order_number}").data["count"], 1
        )

    def test_order_detail_includes_items_payments_and_esims(self):
        response = self.client.get(f"{ADMIN}/orders/{self.order.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(len(response.data["payments"]), 1)
        self.assertEqual(len(response.data["esims"]), 1)

    def test_order_payloads_never_expose_wholesale_cost(self):
        # Assert against the rendered response body — that is what actually goes on the
        # wire, and it catches leaks that inspecting the in-memory dict could miss.
        body = self.client.get(f"{ADMIN}/orders/{self.order.id}/").content.decode()
        self.assertNotIn("wholesale", body)
        self.assertNotIn("supplier_package_code", body)

    def test_esim_block_in_order_detail_has_no_credentials(self):
        esims = self.client.get(f"{ADMIN}/orders/{self.order.id}/").data["esims"]
        self.assertNotIn("credentials", esims[0])
        self.assertIn("iccid_last4", esims[0])

    def test_customer_list_and_detail(self):
        self.assertGreaterEqual(self.client.get(f"{ADMIN}/customers/").data["count"], 1)
        response = self.client.get(f"{ADMIN}/customers/{self.customer.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["customer"]["email"], "cust@example.com")
        self.assertEqual(len(response.data["orders"]), 1)

    def test_viewing_a_customer_is_audited(self):
        self.client.get(f"{ADMIN}/customers/{self.customer.id}/")
        event = AuditEvent.objects.get(action="customer.viewed")
        self.assertEqual(event.context["customer_email"], "cust@example.com")

    def test_payment_list(self):
        self.assertEqual(self.client.get(f"{ADMIN}/payments/").data["count"], 1)


@override_settings(SUPPLIER_GATEWAY="fake")
class EsimAdminTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.superuser = platform_user("root@example.com", superuser=True)
        self.support = platform_user("support@example.com", "support_admin")
        self.finance = platform_user("fin@example.com", "finance_admin")
        self.order = place_order()
        settle(self.order)
        self.profile = EsimProfile.objects.get(order_item__order=self.order)
        self.credentials = esim_services.decrypt_credentials(self.profile)

    def test_list_and_detail_never_include_credentials(self):
        self.client.force_authenticate(self.superuser)
        for url in (f"{ADMIN}/esims/", f"{ADMIN}/esims/{self.profile.id}/"):
            body = self.client.get(url).content.decode()
            for secret in self.credentials.values():
                self.assertNotIn(secret, body, url)

    def test_reveal_returns_credentials_to_an_authorised_role(self):
        self.client.force_authenticate(self.support)
        response = self.client.post(f"{ADMIN}/esims/{self.profile.id}/reveal/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["credentials"]["qr_payload"], self.credentials["qr_payload"]
        )

    def test_reveal_is_denied_without_the_capability(self):
        """Finance handles money, not customer credentials."""
        self.client.force_authenticate(self.finance)
        response = self.client.post(f"{ADMIN}/esims/{self.profile.id}/reveal/")
        self.assertEqual(response.status_code, 403)

    def test_reveal_is_audited_without_storing_the_secret(self):
        self.client.force_authenticate(self.support)
        self.client.post(f"{ADMIN}/esims/{self.profile.id}/reveal/")
        event = AuditEvent.objects.get(action="esim.credentials_revealed")
        self.assertEqual(event.actor_id, self.support.id)
        blob = json.dumps({"c": event.changes, "x": event.context})
        for secret in self.credentials.values():
            self.assertNotIn(secret, blob)

    def test_refresh_usage(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.post(f"{ADMIN}/esims/{self.profile.id}/refresh-usage/")
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertIsNotNone(self.profile.last_synced_at)


@override_settings(SUPPLIER_GATEWAY="fake")
class OperationsTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.superuser = platform_user("root@example.com", superuser=True)
        self.order = place_order()
        settle(self.order)
        self.client.force_authenticate(self.superuser)
        self.event = SupplierEvent.objects.filter(order_item__order=self.order).first()

    def test_supplier_event_list_and_filter(self):
        self.assertEqual(self.client.get(f"{ADMIN}/supplier-events/").data["count"], 1)
        self.assertEqual(
            self.client.get(f"{ADMIN}/supplier-events/?status=succeeded").data["count"], 1
        )

    def test_succeeded_job_cannot_be_retried(self):
        """Re-running a completed provision could buy a second eSIM."""
        response = self.client.post(f"{ADMIN}/supplier-events/{self.event.id}/retry/")
        self.assertEqual(response.status_code, 409)

    def test_failed_job_can_be_retried_and_keeps_its_idempotency_key(self):
        original_key = self.event.idempotency_key
        SupplierEvent.objects.filter(pk=self.event.pk).update(status="manual_review")
        response = self.client.post(f"{ADMIN}/supplier-events/{self.event.id}/retry/")
        self.assertEqual(response.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, "pending")
        self.assertIsNone(self.event.next_attempt_at)
        self.assertEqual(self.event.idempotency_key, original_key)
        self.assertTrue(AuditEvent.objects.filter(action="supplier_event.retried").exists())

    def test_notification_retry(self):
        notification = Notification.objects.filter(order=self.order).first()
        Notification.objects.filter(pk=notification.pk).update(status="failed")
        response = self.client.post(f"{ADMIN}/notifications/{notification.id}/retry/")
        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertEqual(notification.status, "queued")


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class AdminOrderCancelTests(APITestCase):
    """Cancelling is the unpaid twin of refunding, and its refusals matter just as much.

    The panel could refund a settled order and do nothing with an unsettled one, so
    abandoned checkouts had no ending and kept holding the promo use they reserved.
    """

    def setUp(self):
        build_catalogue()
        self.admin = platform_user("ops@example.com", "platform_admin")
        self.support = platform_user("support@example.com", "support_admin")
        self.agency = Organization.objects.create(
            name="Sunrise", organization_type="travel_agency",
            billing_email="s@s.com", status="active",
        )
        create_agency_tracking_code(self.agency, code="TRACK", commission_bps=2000)

    def _url(self, order):
        return f"{ADMIN}/orders/{order.id}/cancel/"

    def test_cancels_an_unpaid_order(self):
        order = place_order()
        self.client.force_authenticate(self.admin)
        response = self.client.post(self._url(order))
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(order.payment_status, "cancelled")
        self.assertEqual(order.fulfillment_status, "cancelled")

    def test_hands_the_promo_reservation_back(self):
        order = place_order(promo="TRACK")
        self.assertEqual(
            PromoRedemption.objects.filter(order=order, status="reserved").count(), 1
        )
        self.client.force_authenticate(self.admin)
        self.client.post(self._url(order))
        self.assertEqual(
            PromoRedemption.objects.filter(order=order, status="released").count(), 1
        )

    def test_refuses_to_cancel_a_settled_order(self):
        """The money guard. A paid order is a refund question, never a cancellation."""
        order = place_order()
        settle(order)
        self.client.force_authenticate(self.admin)
        response = self.client.post(self._url(order))
        self.assertEqual(response.status_code, 409)
        order.refresh_from_db()
        self.assertNotEqual(order.status, "cancelled")

    def test_support_may_cancel_an_unpaid_order(self):
        """`support_admin` holds MANAGE_ORDER on purpose: "Support can help a customer
        but must not touch money or pricing." Cancelling an unpaid order moves no money —
        no charge, no refund, no payout — so it is squarely support's job. The money
        boundary is kept by the guard below, not by withholding the capability."""
        order = place_order()
        self.client.force_authenticate(self.support)
        response = self.client.post(self._url(order))
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_support_still_cannot_cancel_a_settled_order(self):
        """Where support's reach actually stops. Paid means refund, and refunds are finance."""
        order = place_order()
        settle(order)
        self.client.force_authenticate(self.support)
        response = self.client.post(self._url(order))
        self.assertEqual(response.status_code, 409)
        order.refresh_from_db()
        self.assertNotEqual(order.status, "cancelled")

    def test_readonly_admin_cannot_cancel(self):
        readonly = platform_user("ro@example.com", "readonly_admin")
        order = place_order()
        self.client.force_authenticate(readonly)
        response = self.client.post(self._url(order))
        self.assertEqual(response.status_code, 403)
        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_anonymous_cannot_cancel(self):
        order = place_order()
        response = self.client.post(self._url(order))
        self.assertIn(response.status_code, (401, 403))
        order.refresh_from_db()
        self.assertEqual(order.status, "pending_payment")

    def test_writes_an_audit_event(self):
        order = place_order()
        self.client.force_authenticate(self.admin)
        self.client.post(self._url(order))
        self.assertTrue(AuditEvent.objects.filter(action="order.cancelled").exists())


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class AdminRefundTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.finance = platform_user("fin@example.com", "finance_admin")
        self.support = platform_user("support@example.com", "support_admin")
        self.agency = Organization.objects.create(
            name="Sunrise", organization_type="travel_agency",
            billing_email="s@s.com", status="active",
        )
        create_agency_tracking_code(self.agency, code="TRACK", commission_bps=2000)
        self.order = place_order(quantity=2, promo="TRACK")  # 4000, no discount
        settle(self.order)
        self.commission = create_commission_for_order(self.order)

    def _allocations(self, amount):
        item = self.order.items.first()
        return {"allocations": [{"order_item_id": str(item.id), "amount_minor": amount}]}

    def test_finance_can_refund(self):
        self.client.force_authenticate(self.finance)
        response = self.client.post(
            f"{ADMIN}/orders/{self.order.id}/refunds/",
            {**self._allocations(2000), "reason": "customer request"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "succeeded")
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "partially_refunded")

    def test_support_cannot_refund(self):
        self.client.force_authenticate(self.support)
        response = self.client.post(
            f"{ADMIN}/orders/{self.order.id}/refunds/", self._allocations(2000),
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Refund.objects.count(), 0)

    def test_refund_reverses_commission_proportionally(self):
        self.assertEqual(self.commission.commission_minor, 800)  # 20% of 4000
        self.client.force_authenticate(self.finance)
        self.client.post(
            f"{ADMIN}/orders/{self.order.id}/refunds/", self._allocations(2000),
            format="json",
        )
        self.commission.refresh_from_db()
        self.assertEqual(self.commission.reversed_minor, 400)  # half refunded

    def test_over_refund_is_rejected(self):
        self.client.force_authenticate(self.finance)
        response = self.client.post(
            f"{ADMIN}/orders/{self.order.id}/refunds/", self._allocations(99999),
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "refund_limit_exceeded")

    def test_refund_is_audited(self):
        self.client.force_authenticate(self.finance)
        self.client.post(
            f"{ADMIN}/orders/{self.order.id}/refunds/", self._allocations(1000),
            format="json",
        )
        event = AuditEvent.objects.get(action="refund.created")
        self.assertEqual(event.actor_id, self.finance.id)

    def test_refund_list_is_finance_only(self):
        self.client.force_authenticate(self.support)
        self.assertEqual(self.client.get(f"{ADMIN}/refunds/").status_code, 403)
        self.client.force_authenticate(self.finance)
        self.assertEqual(self.client.get(f"{ADMIN}/refunds/").status_code, 200)
