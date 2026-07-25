from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.catalog.models import CatalogPlan, Country, Supplier, TopupProduct
from apps.common.exceptions import Conflict, TopupNotSupported
from apps.esims import services
from apps.esims.models import EsimProfile, SupplierEvent, TopupFulfillment
from apps.esims.supplier import FakeSupplier, SupplierTimeout
from apps.orders import services as order_services

GATEWAY = "apps.esims.services.supplier_module.get_supplier_gateway"


def _plan():
    supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
    country = Country.objects.create(
        iso2="FR", name="France", slug="france", region="Europe", is_active=True
    )
    plan = CatalogPlan.objects.create(
        supplier=supplier, country=country, product_code="FR-5GB-30D",
        supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
        data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
        wholesale_amount_minor=600, currency="USD", status="active",
    )
    return supplier, country, plan


def _paid_order(user=None, qty=1):
    cart, _ = order_services.create_cart(user=user)
    order_services.add_item(cart, product_code="FR-5GB-30D", quantity=qty)
    order = order_services.checkout(
        cart_id=cart.id, customer_email=(user.email if user else "a@b.com"), user=user
    )
    services.enqueue_provisioning_for_order(order)
    return order


def _drain():
    processed = 0
    while services.claim_and_process_one():
        processed += 1
    return processed


class ProvisioningTimeout:
    def provision(self, **kwargs):
        raise SupplierTimeout("supplier timed out")


class FlakySupplier:
    def __init__(self):
        self.calls = 0

    def provision(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise SupplierTimeout("supplier timed out")
        return FakeSupplier().provision(**kwargs)


@override_settings(SUPPLIER_GATEWAY="fake")
class ProvisioningTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        _plan()

    def test_one_profile_and_event_per_esim_item(self):
        order = _paid_order(qty=3)
        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), 3)
        self.assertEqual(SupplierEvent.objects.filter(order_item__order=order).count(), 3)

    def test_worker_provisions_encrypts_and_redacts(self):
        order = _paid_order(qty=1)
        self.assertEqual(_drain(), 1)
        profile = EsimProfile.objects.get(order_item__order=order)
        self.assertEqual(profile.status, "ready")
        self.assertIsNotNone(profile.iccid_hash)
        self.assertTrue(bytes(profile.iccid_encrypted))
        self.assertEqual(len(profile.iccid_last4), 4)
        creds = services.decrypt_credentials(profile)
        self.assertTrue(creds["qr_payload"].startswith("LPA:"))
        self.assertNotIn("iccid", profile.supplier_payload_redacted)
        self.assertNotIn("activation_code", profile.supplier_payload_redacted)
        self.assertEqual(SupplierEvent.objects.get(order_item__order=order).status, "succeeded")

    def test_enqueue_is_idempotent(self):
        order = _paid_order(qty=2)
        services.enqueue_provisioning_for_order(order)
        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), 2)
        self.assertEqual(SupplierEvent.objects.filter(order_item__order=order).count(), 2)

    def test_reprocessing_creates_no_duplicate_profile(self):
        order = _paid_order(qty=1)
        _drain()
        services.enqueue_provisioning_for_order(order)
        self.assertEqual(EsimProfile.objects.filter(order_item__order=order).count(), 1)
        self.assertEqual(SupplierEvent.objects.filter(order_item__order=order).count(), 1)

    def test_supplier_timeout_schedules_retry(self):
        order = _paid_order(qty=1)
        with patch(GATEWAY, return_value=ProvisioningTimeout()):
            self.assertTrue(services.claim_and_process_one())
        event = SupplierEvent.objects.get(order_item__order=order)
        self.assertEqual(event.status, "retrying")
        self.assertEqual(event.attempt_count, 1)
        self.assertIsNotNone(event.next_attempt_at)
        self.assertEqual(EsimProfile.objects.get(order_item__order=order).status, "pending")

    def test_timeout_then_success(self):
        order = _paid_order(qty=1)
        with patch(GATEWAY, return_value=FlakySupplier()):
            services.claim_and_process_one()
            SupplierEvent.objects.filter(order_item__order=order).update(next_attempt_at=None)
            services.claim_and_process_one()
        event = SupplierEvent.objects.get(order_item__order=order)
        self.assertEqual(event.status, "succeeded")
        self.assertEqual(EsimProfile.objects.get(order_item__order=order).status, "ready")

    def test_exhausted_retries_move_to_manual_review(self):
        order = _paid_order(qty=1)
        with patch(GATEWAY, return_value=ProvisioningTimeout()):
            for _ in range(services.MAX_ATTEMPTS):
                SupplierEvent.objects.filter(order_item__order=order).update(next_attempt_at=None)
                services.claim_and_process_one()
        event = SupplierEvent.objects.get(order_item__order=order)
        self.assertEqual(event.status, "manual_review")
        self.assertEqual(event.attempt_count, services.MAX_ATTEMPTS)

    def test_order_fulfilled_when_all_provisioned(self):
        order = _paid_order(qty=2)
        _drain()
        order.refresh_from_db()
        self.assertEqual(order.fulfillment_status, "delivered")
        self.assertEqual(order.status, "fulfilled")


@override_settings(SUPPLIER_GATEWAY="fake")
class EsimAPITests(APITestCase):
    def setUp(self):
        _plan()
        self.owner = User.objects.create_user(email="owner@example.com", password="pw-123456789")
        self.other = User.objects.create_user(email="other@example.com", password="pw-123456789")
        self.order = _paid_order(user=self.owner)
        _drain()
        self.profile = EsimProfile.objects.get(order_item__order=self.order)

    def test_unauthenticated_denied(self):
        self.assertIn(self.client.get("/api/v1/esims/").status_code, (401, 403))

    def test_list_scoped_to_owner(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get("/api/v1/esims/").data["count"], 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/v1/esims/").data["count"], 0)

    def test_list_excludes_credentials(self):
        self.client.force_authenticate(self.owner)
        row = self.client.get("/api/v1/esims/").data["results"][0]
        self.assertNotIn("credentials", row)
        self.assertIn("iccid_last4", row)

    def test_detail_returns_credentials_to_owner(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/v1/esims/{self.profile.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["credentials"]["qr_payload"].startswith("LPA:"))

    def test_detail_denied_for_non_owner(self):
        self.client.force_authenticate(self.other)
        response = self.client.get(f"/api/v1/esims/{self.profile.id}/")
        self.assertEqual(response.status_code, 404)

    def test_refresh_usage_updates_sync_time(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(f"/api/v1/esims/{self.profile.id}/refresh-usage/")
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertIsNotNone(self.profile.last_synced_at)


def _topup_product(supplier, code="TU-1GB", data_mb=1000, retail=500, status="active"):
    return TopupProduct.objects.create(
        supplier=supplier, product_code=code, supplier_package_code="TUP-" + code,
        name=f"{data_mb} MB top-up", data_amount_mb=data_mb, validity_days=30,
        retail_amount_minor=retail, currency="USD", status=status,
    )


@override_settings(SUPPLIER_GATEWAY="fake")
class TopupTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        _plan()

    def _provisioned_profile(self, user):
        order = _paid_order(user=user)
        _drain()
        return EsimProfile.objects.get(order_item__order=order)

    def test_create_topup_order(self):
        user = User.objects.create_user(email="o@e.com", password="pw-123456789")
        profile = self._provisioned_profile(user)
        product = _topup_product(profile.supplier)
        order = services.create_topup_order(
            user=user, esim_profile_id=profile.id, topup_product_code="TU-1GB"
        )
        self.assertEqual(order.total_minor, 500)
        item = order.items.get()
        self.assertEqual(item.item_type, "topup")
        self.assertEqual(item.topup_product_id, product.id)
        self.assertTrue(TopupFulfillment.objects.filter(order_item=item).exists())

    def test_topup_provisioning_increases_usage(self):
        user = User.objects.create_user(email="o@e.com", password="pw-123456789")
        profile = self._provisioned_profile(user)
        before = profile.total_data_bytes
        _topup_product(profile.supplier)
        order = services.create_topup_order(
            user=user, esim_profile_id=profile.id, topup_product_code="TU-1GB"
        )
        services.enqueue_provisioning_for_order(order)
        while services.claim_and_process_one():
            pass
        profile.refresh_from_db()
        self.assertEqual(profile.total_data_bytes, before + 1000 * 1_000_000)
        fulfillment = TopupFulfillment.objects.get(order_item__order=order)
        self.assertEqual(fulfillment.status, "completed")
        order.refresh_from_db()
        self.assertEqual(order.status, "fulfilled")

    def test_topup_incompatible_supplier_rejected(self):
        user = User.objects.create_user(email="o@e.com", password="pw-123456789")
        profile = self._provisioned_profile(user)
        other = Supplier.objects.create(code="other", name="Other", status="active")
        _topup_product(other, code="TU-OTHER")
        with self.assertRaises(TopupNotSupported):
            services.create_topup_order(
                user=user, esim_profile_id=profile.id, topup_product_code="TU-OTHER"
            )

    def test_topup_non_owner_rejected(self):
        owner = User.objects.create_user(email="o@e.com", password="pw-123456789")
        other = User.objects.create_user(email="x@e.com", password="pw-123456789")
        profile = self._provisioned_profile(owner)
        _topup_product(profile.supplier)
        with self.assertRaises(Conflict):
            services.create_topup_order(
                user=other, esim_profile_id=profile.id, topup_product_code="TU-1GB"
            )


@override_settings(SUPPLIER_GATEWAY="fake")
class TopupAPITests(APITestCase):
    def setUp(self):
        _plan()
        self.owner = User.objects.create_user(email="owner@example.com", password="pw-123456789")
        order = _paid_order(user=self.owner)
        _drain()
        self.profile = EsimProfile.objects.get(order_item__order=order)
        _topup_product(self.profile.supplier)

    def test_post_creates_topup_order(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f"/api/v1/esims/{self.profile.id}/topups/",
            {"topup_product_code": "TU-1GB"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total_minor"], 500)

    def test_get_lists_available_and_history(self):
        self.client.force_authenticate(self.owner)
        self.client.post(
            f"/api/v1/esims/{self.profile.id}/topups/",
            {"topup_product_code": "TU-1GB"}, format="json",
        )
        response = self.client.get(f"/api/v1/esims/{self.profile.id}/topups/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["available"]), 1)
        self.assertEqual(len(response.data["history"]), 1)
