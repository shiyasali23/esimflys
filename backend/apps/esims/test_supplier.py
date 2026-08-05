"""eSIM Access gateway tests.

All HTTP is mocked — no test ever reaches the live API or spends wallet money. The
envelope shape and auth scheme mirror what was verified against the real
``/balance/query`` endpoint on 2026-07-29.
"""

import json

import httpx
from django.test import TestCase, override_settings

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile, SupplierEvent
from apps.esims.supplier import (
    DuplicateTransaction,
    EsimAccessGateway,
    SupplierError,
    SupplierNotReady,
    SupplierPermanentError,
    SupplierTimeout,
    supplier_amount_to_minor,
)
from apps.orders import services as order_services

SUPPLIER_SETTINGS = dict(
    ESIM_SUPPLIER_BASE_URL="https://api.esimaccess.com",
    ESIM_SUPPLIER_API_KEY="test-access-code",
    ESIM_SUPPLIER_SECRET_KEY="",
    SUPPLIER_GATEWAY="esim_access",
)


def gateway_with(handler):
    """Build a gateway whose HTTP layer is a mock transport."""
    return EsimAccessGateway(client=httpx.Client(transport=httpx.MockTransport(handler)))


def ok(obj):
    return httpx.Response(200, json={"success": True, "errorCode": 0, "errorMsg": None, "obj": obj})


def err(code, message="nope"):
    return httpx.Response(
        200, json={"success": False, "errorCode": code, "errorMsg": message, "obj": None}
    )


@override_settings(**SUPPLIER_SETTINGS)
class TransportTests(TestCase):
    def test_auth_uses_rt_accesscode_not_bearer(self):
        """Regression guard: the stub previously sent `Authorization: Bearer`, which fails."""
        seen = {}

        def handler(request):
            seen.update(request.headers)
            return ok({"balance": 0})

        gateway_with(handler).query_balance()
        self.assertEqual(seen.get("rt-accesscode"), "test-access-code")
        self.assertNotIn("authorization", seen)

    def test_calls_are_post_to_the_open_api_path(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["method"] = request.method
            return ok({"balance": 0})

        gateway_with(handler).query_balance()
        self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["url"], "https://api.esimaccess.com/api/v1/open/balance/query")

    @override_settings(**{**SUPPLIER_SETTINGS, "ESIM_SUPPLIER_SECRET_KEY": "s3cret"})
    def test_hmac_headers_added_only_when_a_secret_key_is_configured(self):
        seen = {}

        def handler(request):
            seen.update(request.headers)
            return ok({"balance": 0})

        gateway_with(handler).query_balance()
        for header in ("rt-timestamp", "rt-requestid", "rt-signature"):
            self.assertIn(header, seen)

    def test_no_hmac_headers_without_a_secret_key(self):
        seen = {}

        def handler(request):
            seen.update(request.headers)
            return ok({"balance": 0})

        gateway_with(handler).query_balance()
        self.assertNotIn("rt-signature", seen)

    def test_network_failure_becomes_a_timeout_not_a_failure(self):
        """Unknown outcome — the order may exist upstream, so it must be retried."""

        def handler(request):
            raise httpx.ConnectError("boom")

        with self.assertRaises(SupplierTimeout):
            gateway_with(handler).query_balance()

    def test_upstream_5xx_is_a_timeout(self):
        with self.assertRaises(SupplierTimeout):
            gateway_with(lambda r: httpx.Response(503)).query_balance()


@override_settings(**SUPPLIER_SETTINGS)
class ErrorMappingTests(TestCase):
    def _raise(self, code):
        return gateway_with(lambda r: err(code))

    def test_auth_failure_is_permanent(self):
        with self.assertRaises(SupplierPermanentError):
            self._raise("401001").query_balance()

    def test_wrong_state_is_permanent(self):
        with self.assertRaises(SupplierPermanentError):
            self._raise("200002").query_balance()

    def test_insufficient_balance_is_retryable(self):
        """Someone can top the wallet up, so this must not be terminal."""
        with self.assertRaises(SupplierError) as caught:
            self._raise("200007").query_balance()
        self.assertNotIsInstance(caught.exception, SupplierPermanentError)
        self.assertIn("top up", str(caught.exception))

    def test_duplicate_transaction_has_its_own_exception(self):
        with self.assertRaises(DuplicateTransaction):
            self._raise("310402").order_esim(package_code="P", transaction_id="t1")


@override_settings(**SUPPLIER_SETTINGS)
class MoneyAndPayloadTests(TestCase):
    def test_supplier_amount_converts_to_our_minor_units(self):
        # Their docs: 18000 == $1.80. Ours: 180 cents.
        self.assertEqual(supplier_amount_to_minor(18000), 180)
        self.assertEqual(supplier_amount_to_minor(10000), 100)
        self.assertIsNone(supplier_amount_to_minor(None))

    def test_balance_is_converted(self):
        # 50,000,000 raw ÷ 10,000 = $5,000.00 = 500,000 minor units.
        gateway = gateway_with(lambda r: ok({"balance": 50_000_000}))
        self.assertEqual(gateway.query_balance()["balance_minor"], 500_000)

    def test_order_sends_transaction_id_as_the_idempotency_key(self):
        seen = {}

        def handler(request):
            seen.update(json.loads(request.content))
            return ok({"orderNo": "ord_1"})

        gateway_with(handler).order_esim(package_code="PKG1", transaction_id="provision:abc")
        self.assertEqual(seen["transactionId"], "provision:abc")
        self.assertEqual(seen["packageInfoList"][0]["packageCode"], "PKG1")

    def test_daily_plans_send_period_num(self):
        seen = {}

        def handler(request):
            seen.update(json.loads(request.content))
            return ok({"orderNo": "ord_1"})

        gateway_with(handler).order_esim(
            package_code="PKG1", transaction_id="t", period_num=7
        )
        self.assertEqual(seen["packageInfoList"][0]["periodNum"], 7)

    def test_query_maps_supplier_fields_to_ours(self):
        profile = {
            "esimTranNo": "etn_1", "iccid": "8944000000000001234", "ac": "ACT123",
            "qrCodeUrl": "https://x/qr.png", "shortUrl": "https://x/i/abc",
            "smdpAddress": "smdp.x", "totalVolume": 1000, "orderUsage": 250,
            "esimStatus": "GOT_RESOURCE", "smdpStatus": "RELEASED",
        }
        result = gateway_with(lambda r: ok({"esimList": [profile]})).query_esim(order_no="o1")
        self.assertEqual(result["supplier_reference"], "etn_1")
        self.assertEqual(result["activation_code"], "ACT123")
        self.assertEqual(result["qr_code_url"], "https://x/qr.png")
        self.assertEqual(result["short_url"], "https://x/i/abc")
        self.assertEqual(result["remaining_data_bytes"], 750)

    def test_stored_supplier_payload_is_redacted(self):
        profile = {
            "esimTranNo": "etn_1", "iccid": "8944000000000001234", "ac": "SECRET-CODE",
            "qrCodeUrl": "https://x/qr.png", "shortUrl": "https://x/i/abc",
        }
        result = gateway_with(lambda r: ok({"esimList": [profile]})).query_esim(order_no="o1")
        raw = json.dumps(result["raw"])
        for secret in ("SECRET-CODE", "8944000000000001234", "https://x/qr.png"):
            self.assertNotIn(secret, raw)

    def test_profile_not_cut_yet_raises_not_ready(self):
        for payload in ({"esimList": []}, {"esimList": [{"esimTranNo": "etn_1"}]}):
            with self.assertRaises(SupplierNotReady):
                gateway_with(lambda r, p=payload: ok(p)).query_esim(order_no="o1")


class _CountingGateway:
    """Counts order attempts so the double-purchase guard can be proved."""

    def __init__(self, *, fail_first_query=False):
        self.order_calls = 0
        self.query_calls = 0
        self.fail_first_query = fail_first_query

    def order_esim(self, *, package_code, transaction_id, count=1, period_num=None):
        self.order_calls += 1
        return {"order_no": f"ord_{self.order_calls}", "raw": {}}

    def query_esim(self, *, order_no=None, transaction_id=None, esim_tran_no=None):
        self.query_calls += 1
        if self.fail_first_query and self.query_calls == 1:
            raise SupplierTimeout("query timed out")
        from apps.esims.supplier import FakeSupplier

        return FakeSupplier().query_esim(order_no=order_no or "x")


@override_settings(SUPPLIER_GATEWAY="fake")
class TwoPhaseProvisioningTests(TestCase):
    """The safety property that protects real money."""

    def setUp(self):
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
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        self.order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        esim_services.enqueue_provisioning_for_order(self.order)
        self.event = SupplierEvent.objects.get(order_item__order=self.order)

    def _run(self, gateway):
        from unittest.mock import patch

        with patch("apps.esims.services.supplier_module.get_supplier_gateway",
                   return_value=gateway):
            return esim_services.claim_and_process_one()

    def test_order_number_is_recorded_before_the_profile_exists(self):
        gateway = _CountingGateway(fail_first_query=True)
        self._run(gateway)
        profile = EsimProfile.objects.get(order_item__order=self.order)
        self.assertEqual(profile.supplier_order_no, "ord_1")
        self.assertEqual(profile.status, "provisioning")

    def test_retry_after_a_failed_query_never_orders_a_second_esim(self):
        """The core guard: one order, no matter how many retries."""
        gateway = _CountingGateway(fail_first_query=True)
        self._run(gateway)                      # orders, then the query times out
        self.assertEqual(gateway.order_calls, 1)

        SupplierEvent.objects.filter(pk=self.event.pk).update(next_attempt_at=None)
        self._run(gateway)                      # retry resumes at the poll phase

        self.assertEqual(gateway.order_calls, 1, "a second eSIM was ordered!")
        self.assertEqual(gateway.query_calls, 2)
        profile = EsimProfile.objects.get(order_item__order=self.order)
        self.assertEqual(profile.status, "ready")
        self.assertEqual(EsimProfile.objects.count(), 1)

    def test_duplicate_transaction_recovers_by_querying(self):
        """If the supplier already has our transactionId, recover — never re-order."""

        class DuplicateThenFine:
            def __init__(self):
                self.order_calls = 0

            def order_esim(self, **kwargs):
                self.order_calls += 1
                raise DuplicateTransaction("310402: duplicate")

            def query_esim(self, **kwargs):
                from apps.esims.supplier import FakeSupplier

                return FakeSupplier().query_esim(transaction_id="t")

        gateway = DuplicateThenFine()
        self._run(gateway)
        profile = EsimProfile.objects.get(order_item__order=self.order)
        self.assertEqual(profile.status, "ready")
        self.assertEqual(gateway.order_calls, 1)

    def test_not_ready_schedules_a_short_poll_not_a_long_backoff(self):
        class NeverReady(_CountingGateway):
            def query_esim(self, **kwargs):
                raise SupplierNotReady("still cutting")

        self._run(NeverReady())
        event = SupplierEvent.objects.get(pk=self.event.pk)
        self.assertEqual(event.status, "retrying")
        self.assertEqual(event.error_code, "awaiting_profile")
        from django.utils import timezone

        seconds = (event.next_attempt_at - timezone.now()).total_seconds()
        self.assertLess(seconds, esim_services.POLL_DELAY_SECONDS + 2)

    def test_all_credential_forms_are_stored_encrypted(self):
        self._run(_CountingGateway())
        profile = EsimProfile.objects.get(order_item__order=self.order)
        credentials = esim_services.decrypt_credentials(profile)
        self.assertTrue(credentials["qr_code_url"].startswith("https://"))
        self.assertTrue(credentials["short_url"].startswith("https://"))
        self.assertTrue(credentials["activation_code"])
        # Nothing readable on the row itself.
        self.assertNotIn(
            credentials["activation_code"], str(profile.supplier_payload_redacted)
        )


@override_settings(**SUPPLIER_SETTINGS)
class VendorResponseShapeTests(TestCase):
    """Parse the profile exactly as eSIM Access documents it publicly.

    Their response carries the whole LPA activation string in a single ``ac`` field. There
    is no ``smdpAddress`` and no QR-payload field. An earlier version read ``smdpAddress``
    and never set ``qr_payload`` at all, so on a real order both were stored NULL — and the
    storefront renders the QR from ``qr_payload``. Every test passed regardless, because the
    fake supplier returns those keys itself. This pins the real shape.
    """

    #: Field names and value shapes taken from the vendor's own published example.
    VENDOR_PROFILE = {
        "orderNo": "B23051616050537",
        "esimTranNo": "ESIM230516160505",
        "iccid": "89852245280001113019",
        "ac": "LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11",
        "qrCodeUrl": "https://p.qrsim.net/888cc893fe1140cd9d2a2286520a6be6.png",
        "smdpStatus": "RELEASED",
        "esimStatus": "GOT_RESOURCE",
        "expiredTime": "2023-06-15T16:56:16+0000",
        "totalVolume": 104857600,
        "orderUsage": 0,
        "durationUnit": "DAY",
    }

    def _query(self):
        def handler(request):
            return ok({"esimList": [self.VENDOR_PROFILE]})

        return gateway_with(handler).query_esim(order_no="B23051616050537")

    def test_qr_payload_is_the_activation_string(self):
        result = self._query()
        self.assertEqual(
            result["qr_payload"], "LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11"
        )
        self.assertEqual(result["activation_code"], result["qr_payload"])

    def test_smdp_address_is_derived_from_the_activation_string(self):
        self.assertEqual(self._query()["smdp_address"], "rsp.redtea.io")

    def test_the_rest_of_the_documented_fields_map(self):
        result = self._query()
        self.assertEqual(result["iccid"], "89852245280001113019")
        self.assertEqual(result["supplier_reference"], "ESIM230516160505")
        self.assertEqual(result["total_data_bytes"], 104857600)
        self.assertEqual(result["remaining_data_bytes"], 104857600)
        self.assertEqual(result["smdp_status"], "RELEASED")
        self.assertTrue(result["qr_code_url"].startswith("https://"))

    def test_a_malformed_activation_string_yields_nothing_rather_than_a_guess(self):
        """A wrong SM-DP+ address points the phone at the wrong server."""
        for bad in ("", None, "not-an-lpa", "LPA:1$", "LPA:1$$id"):
            profile = dict(self.VENDOR_PROFILE, ac=bad)

            def handler(request, profile=profile):
                return ok({"esimList": [profile]})

            result = gateway_with(handler).query_esim(order_no="X")
            self.assertIsNone(result["smdp_address"], bad)
            self.assertIsNone(result["qr_payload"], bad)
