"""Handing an unused eSIM back to the supplier.

`cancel_esim` sat on the gateway with NO caller anywhere in the codebase, so refunding a
customer returned their money and left the eSIM live with the wholesale cost already
spent. Three profiles in production carried `status="cancelled"` while the supplier still
listed them as ours — proven by cancelling them by hand and watching the wallet rise.

The guard is the part that must not be wrong: cancelling an eSIM somebody is USING cuts
off a traveller who has already paid, and the supplier credits nothing for it.
"""

from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile
from apps.orders import services as order_services


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class CancellationGuard(TestCase):
    @classmethod
    def setUpTestData(cls):
        sup = Supplier.objects.create(code="s", name="S", status="active")
        country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="EU", is_active=True
        )
        CatalogPlan.objects.create(
            supplier=sup, country=country, product_code="FR-5GB", supplier_package_code="P",
            plan_type="fixed", display_name="FR 5GB", data_limit_mb=5000, validity_days=30,
            retail_amount_minor=1500, wholesale_amount_minor=700, currency="USD", status="active",
        )

    def _profile(self, **overrides):
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        profile = EsimProfile.objects.get(order_item__order=order)
        for field, value in overrides.items():
            setattr(profile, field, value)
        if overrides:
            profile.save()
        return profile

    def test_an_unused_esim_can_be_cancelled(self):
        profile = self._profile()
        self.assertIsNone(esim_services.esim_cancellation_blocker(profile))

    def test_refuses_an_esim_the_customer_is_using(self):
        profile = self._profile(esim_status="IN_USE")
        blocker = esim_services.esim_cancellation_blocker(profile)
        self.assertIn("using it right now", blocker)

    def test_refuses_an_esim_with_any_usage_at_all(self):
        """One megabyte is enough. There is no `data_used_mb` column — usage is total minus
        remaining — and the supplier credits nothing for a used eSIM."""
        profile = self._profile(total_data_bytes=5_000_000_000, remaining_data_bytes=4_999_000_000)
        self.assertIn("already been used", esim_services.esim_cancellation_blocker(profile))

    def test_refuses_an_already_cancelled_esim(self):
        profile = self._profile(status="cancelled")
        self.assertIn("already cancelled", esim_services.esim_cancellation_blocker(profile))

    def test_refuses_a_finished_esim(self):
        profile = self._profile(esim_status="USED_EXPIRED")
        self.assertIn("nothing to reclaim", esim_services.esim_cancellation_blocker(profile))

    def test_refuses_a_profile_with_no_supplier_reference(self):
        profile = self._profile(supplier_reference=None)
        self.assertIn("nothing to cancel", esim_services.esim_cancellation_blocker(profile))


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class CancellingCallsTheSupplier(CancellationGuard):
    def test_it_actually_calls_the_supplier_and_records_the_result(self):
        """The whole defect was a local status change with no supplier call behind it."""
        profile = self._profile()
        gateway = esim_services.supplier_module.get_supplier_gateway()
        with patch.object(type(gateway), "cancel_esim", return_value={}) as spy, \
             patch.object(esim_services.supplier_module, "get_supplier_gateway", return_value=gateway):
            esim_services.cancel_esim_at_supplier(profile)
        spy.assert_called_once_with(supplier_reference=profile.supplier_reference)
        profile.refresh_from_db()
        self.assertEqual(profile.status, "cancelled")
        self.assertEqual(profile.esim_status, "CANCEL")

    def test_a_supplier_failure_leaves_the_record_untouched(self):
        """Marking it cancelled when the supplier refused is exactly the drift that put
        three live eSIMs in production behind a `cancelled` row."""
        from apps.esims.supplier import SupplierError

        profile = self._profile()
        gateway = esim_services.supplier_module.get_supplier_gateway()
        with patch.object(type(gateway), "cancel_esim", side_effect=SupplierError("nope")), \
             patch.object(esim_services.supplier_module, "get_supplier_gateway", return_value=gateway):
            with self.assertRaises(SupplierError):
                esim_services.cancel_esim_at_supplier(profile)
        profile.refresh_from_db()
        self.assertNotEqual(profile.status, "cancelled")

    def test_a_blocked_esim_never_reaches_the_supplier(self):
        profile = self._profile(total_data_bytes=5_000_000_000, remaining_data_bytes=4_000_000_000)
        gateway = esim_services.supplier_module.get_supplier_gateway()
        with patch.object(type(gateway), "cancel_esim") as spy, \
             patch.object(esim_services.supplier_module, "get_supplier_gateway", return_value=gateway):
            with self.assertRaises(ValueError):
                esim_services.cancel_esim_at_supplier(profile)
        spy.assert_not_called()

    def test_cancelling_twice_does_not_call_the_supplier_twice(self):
        profile = self._profile()
        gateway = esim_services.supplier_module.get_supplier_gateway()
        with patch.object(type(gateway), "cancel_esim", return_value={}) as spy, \
             patch.object(esim_services.supplier_module, "get_supplier_gateway", return_value=gateway):
            esim_services.cancel_esim_at_supplier(profile)
            with self.assertRaises(ValueError):
                esim_services.cancel_esim_at_supplier(profile)
        self.assertEqual(spy.call_count, 1)
