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
from apps.orders.models import Notification, Order, PromoCode, PromoRedemption
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


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class DashboardMarginTests(APITestCase):
    """Margin must measure what we kept, not what things were listed at.

    The original summed `OrderItem.unit_amount_minor` — the pre-discount price — so every
    promo read as profit. On production that showed as $12.05 of margin against $11.96 of
    revenue and $3.90 of supplier cost, the gap being one 100%-off order reporting its
    full list price.
    """

    def setUp(self):
        build_catalogue()
        self.admin = platform_user("pricing@example.com", "platform_admin")
        self.client.force_authenticate(self.admin)

    def _margin(self):
        return self.client.get(f"{ADMIN}/dashboard/").data["margin"]

    def test_a_fully_discounted_order_adds_no_margin(self):
        PromoCode.objects.create(
            code="ALLFREE", kind="discount", discount_type="percentage_bps",
            discount_value=10000, is_active=True,
        )
        order = place_order(promo="ALLFREE")
        # A zero-total order has no Payment row — `payment_amount_positive` forbids one,
        # and the app skips Stripe entirely for these (payments/services.py:32). It is
        # settled by `_complete_zero_total`, so the test must settle it the same way.
        Order.objects.filter(pk=order.pk).update(payment_status="paid", status="paid")
        order.refresh_from_db()

        margin = self._margin()
        self.assertEqual(order.total_minor, 0)
        self.assertEqual(margin["retail_minor"], 0)
        # It still cost us the wholesale price, so margin is NEGATIVE. That is the truth
        # a free order tells, and the old figure hid it behind the list price.
        self.assertLess(margin["margin_minor"], 0)

    def test_margin_is_revenue_minus_supplier_cost(self):
        order = place_order()
        settle(order)

        margin = self._margin()
        wholesale = sum(i.wholesale_amount_minor or 0 for i in order.items.all())
        self.assertEqual(margin["retail_minor"], order.total_minor)
        self.assertEqual(margin["wholesale_minor"], wholesale)
        self.assertEqual(margin["margin_minor"], order.total_minor - wholesale)

    def test_margin_honours_the_date_range(self):
        """It ignored date_from/date_to entirely, so changing the range moved revenue
        while margin stood still."""
        order = place_order()
        settle(order)

        data = self.client.get(
            f"{ADMIN}/dashboard/?date_from=2099-01-01&date_to=2099-12-31"
        ).data
        self.assertEqual(data["margin"]["retail_minor"], 0)
        self.assertEqual(data["margin"]["wholesale_minor"], 0)


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class DemoAgencyExclusionTests(APITestCase):
    """Demo agencies must not move the platform's own numbers.

    A demo agency exists so a prospect can sign into the REAL portal and see real screens
    with a believable history. Its orders are therefore real rows in the real tables, and
    without this every headline figure would count them — the owner's revenue would be
    fiction for as long as the demo existed.
    """

    def setUp(self):
        build_catalogue()
        self.admin = platform_user("root2@example.com", superuser=True)
        self.client.force_authenticate(self.admin)

        self.demo = Organization.objects.create(
            name="Demo Travels", organization_type="travel_agency",
            billing_email="d@d.com", status="active", metadata={"demo": True},
        )
        self.real = Organization.objects.create(
            name="Real Travels", organization_type="travel_agency",
            billing_email="r@r.com", status="active",
        )
        create_agency_tracking_code(self.demo, code="DEMOCODE", commission_bps=1200)
        create_agency_tracking_code(self.real, code="REALCODE", commission_bps=1000)

        self.direct = place_order(email="direct@example.com")
        settle(self.direct)
        self.real_order = place_order(email="real@example.com", promo="REALCODE")
        settle(self.real_order)
        self.demo_order = place_order(email="demo@example.com", promo="DEMOCODE")
        settle(self.demo_order)

    def _dashboard(self):
        return self.client.get(f"{ADMIN}/dashboard/").data

    def test_revenue_excludes_the_demo_agency(self):
        data = self._dashboard()
        expected = self.direct.total_minor + self.real_order.total_minor
        self.assertEqual(data["revenue"]["gross_minor"], expected)

    def test_a_real_agency_is_still_counted(self):
        """The case the obvious query breaks.

        [MEASURED] `exclude(referring_organization__metadata__demo=True)` makes
        `{}->'demo'` NULL for every agency that is NOT a demo, and excluding on NULL drops
        the row — a real agency's orders vanished from revenue entirely. This test is the
        one that catches it; the demo-exclusion test above passes either way.
        """
        data = self._dashboard()
        self.assertGreaterEqual(data["revenue"]["gross_minor"], self.real_order.total_minor)
        self.assertEqual(data["orders"]["total"], 2)

    def test_a_direct_sale_with_no_agency_is_still_counted(self):
        """The other half of the same trap: an order with a NULL agency must survive."""
        data = self._dashboard()
        self.assertGreaterEqual(data["revenue"]["gross_minor"], self.direct.total_minor)

    def test_every_figure_agrees_with_every_other(self):
        """Excluding demo rows from the order count but not the eSIM count would leave the
        dashboard contradicting itself, which is worse than counting them."""
        data = self._dashboard()
        self.assertEqual(data["orders"]["total"], 2)
        self.assertEqual(data["orders"]["paid"], 2)
        self.assertEqual(data["esims"]["total"], 2)

    def test_commission_excludes_the_demo_agency(self):
        create_commission_for_order(self.real_order)
        create_commission_for_order(self.demo_order)
        data = self._dashboard()
        real_only = PartnerCommission.objects.get(organization=self.real).commission_minor
        self.assertEqual(data["commissions"]["outstanding_minor"], real_only)

    def test_margin_excludes_the_demo_agency_on_both_sides(self):
        """Revenue and supplier cost are SEPARATE queries — one over orders, one over
        order items. Filtering only the revenue side leaves the demo's wholesale cost in
        the total, which understates margin rather than overstating it, and is just as
        wrong."""
        data = self._dashboard()
        real_orders = [self.direct, self.real_order]
        expected_revenue = sum(o.total_minor for o in real_orders)
        expected_wholesale = sum(
            item.wholesale_amount_minor or 0
            for order in real_orders
            for item in order.items.all()
        )
        self.assertEqual(data["margin"]["retail_minor"], expected_revenue)
        self.assertEqual(data["margin"]["wholesale_minor"], expected_wholesale)
        self.assertEqual(
            data["margin"]["margin_minor"], expected_revenue - expected_wholesale
        )

    def test_the_revenue_series_excludes_the_demo_agency(self):
        series = self.client.get(f"{ADMIN}/reports/revenue/").data["series"]
        total = sum(row["revenue_minor"] for row in series)
        self.assertEqual(total, self.direct.total_minor + self.real_order.total_minor)

    def test_the_panel_can_see_which_agency_is_a_demo(self):
        """Excluded from the numbers AND labelled. An operator looking at a real-looking
        agency whose sales are missing from every report needs to know why."""
        rows = {r["name"]: r for r in self.client.get(f"{ADMIN}/organizations/").data["results"]}
        self.assertTrue(rows["Demo Travels"]["is_demo"])
        self.assertFalse(rows["Real Travels"]["is_demo"])

    def test_never_exposes_the_raw_metadata_column(self):
        """`is_demo` is derived. Publishing the JSONField would leak whatever else lands
        in it later."""
        row = self.client.get(f"{ADMIN}/organizations/").data["results"][0]
        self.assertNotIn("metadata", row)
