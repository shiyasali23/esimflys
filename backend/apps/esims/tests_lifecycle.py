"""The eSIM lifecycle mapper.

Every profile in production sat at `status="ready"` with `installed_at`, `activated_at`
and `expires_at` all NULL and a full data balance — including one that had really used
382 MB. The supplier had been telling us otherwise on every poll; nothing read it.

The tests that matter most here are the ones asserting the mapper does NOT move: an
unknown status must not walk a live eSIM backwards, and a blank reading must not erase
a timestamp that was already earned.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import lifecycle, services as esim_services
from apps.esims.models import EsimProfile
from apps.esims.supplier import get_supplier_gateway
from apps.orders import services as order_services
from django.db import transaction


def state(**kw):
    base = {"smdp_status": None, "esim_status": None}
    base.update(kw)
    return base


class DeriveStatusTests(TestCase):
    """`smdpStatus RELEASED → INSTALLATION → ENABLED`, `esimStatus GOT_RESOURCE → IN_USE`,
    read off a real order during a support investigation."""

    def test_delivered_but_untouched_stays_ready(self):
        self.assertEqual(
            lifecycle.derive_status(
                smdp_status="RELEASED", esim_status="GOT_RESOURCE", current="ready"
            ),
            "ready",
        )

    def test_on_the_device_is_installed(self):
        self.assertEqual(
            lifecycle.derive_status(
                smdp_status="INSTALLATION", esim_status="GOT_RESOURCE", current="ready"
            ),
            "installed",
        )

    def test_line_switched_on_is_active(self):
        self.assertEqual(
            lifecycle.derive_status(
                smdp_status="ENABLED", esim_status="IN_USE", current="installed"
            ),
            "active",
        )

    def test_allowance_exhausted_is_expired_even_while_enabled(self):
        """Terminal beats live: an eSIM can be ENABLED and out of data at the same time,
        and telling the customer it is active would be wrong."""
        self.assertEqual(
            lifecycle.derive_status(
                smdp_status="ENABLED", esim_status="USED_UP", current="active"
            ),
            "expired",
        )

    def test_an_unknown_status_changes_nothing(self):
        """Suppliers add states. Collapsing an unrecognised one into `ready` would walk a
        live eSIM backwards and tell support the customer never installed it."""
        self.assertEqual(
            lifecycle.derive_status(
                smdp_status="SOME_NEW_STATE", esim_status="ALSO_NEW", current="active"
            ),
            "active",
        )

    def test_never_overrides_a_deliberate_state(self):
        """`failed` and `manual_review` were set by provisioning or by an operator. A
        usage poll must not overwrite that judgement."""
        for deliberate in ("failed", "manual_review", "cancelled"):
            self.assertEqual(
                lifecycle.derive_status(
                    smdp_status="ENABLED", esim_status="IN_USE", current=deliberate
                ),
                deliberate,
            )


class ApplyStateTests(TestCase):
    def _profile(self, **kw):
        kw.setdefault("status", "ready")
        return EsimProfile(**kw)

    def test_stamps_installed_and_activated_on_first_sight(self):
        p = self._profile()
        changed = lifecycle.apply_supplier_state(
            p, state(smdp_status="ENABLED", esim_status="IN_USE")
        )
        self.assertIsNotNone(p.installed_at)
        self.assertIsNotNone(p.activated_at)
        self.assertEqual(p.status, "active")
        self.assertIn("last_synced_at", changed)

    def test_installed_without_activated(self):
        """The exact state a real customer sat in: on the device, never switched on,
        because Data Roaming was off."""
        p = self._profile()
        lifecycle.apply_supplier_state(
            p, state(smdp_status="INSTALLATION", esim_status="GOT_RESOURCE")
        )
        self.assertIsNotNone(p.installed_at)
        self.assertIsNone(p.activated_at)
        self.assertEqual(p.status, "installed")

    def test_a_timestamp_is_never_re_stamped(self):
        first = timezone.now() - timedelta(days=2)
        p = self._profile(installed_at=first, activated_at=first, status="active")
        lifecycle.apply_supplier_state(
            p, state(smdp_status="ENABLED", esim_status="IN_USE")
        )
        self.assertEqual(p.installed_at, first)
        self.assertEqual(p.activated_at, first)

    def test_a_blank_reading_never_erases_history(self):
        """Usage polling is a snapshot of a lagging remote system. A transient empty
        reply must not un-activate an eSIM."""
        when = timezone.now() - timedelta(days=1)
        p = self._profile(installed_at=when, activated_at=when, status="active")
        lifecycle.apply_supplier_state(p, state())
        self.assertEqual(p.installed_at, when)
        self.assertEqual(p.activated_at, when)
        self.assertEqual(p.status, "active")

    def test_records_the_suppliers_own_words(self):
        p = self._profile()
        lifecycle.apply_supplier_state(
            p, state(smdp_status="ENABLED", esim_status="IN_USE")
        )
        self.assertEqual(p.smdp_status, "ENABLED")
        self.assertEqual(p.esim_status, "IN_USE")

    def test_writes_the_expiry_the_supplier_reports(self):
        when = timezone.now() + timedelta(days=7)
        p = self._profile()
        lifecycle.apply_supplier_state(p, state(expires_at=when))
        self.assertEqual(p.expires_at, when)


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class RefreshUsageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        cls.country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        cls.plan = CatalogPlan.objects.create(
            supplier=cls.supplier, country=cls.country, product_code="FR-5GB-30D",
            supplier_package_code="PKG-FR", plan_type="fixed", display_name="5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            wholesale_amount_minor=700, currency="USD", status="active",
        )

    def _delivered_profile(self, reference=None):
        with transaction.atomic():
            order = order_services.create_order(
                lines=[order_services.OrderLine(catalog_plan_id=self.plan.id, quantity=1)],
                customer_email="buyer@example.com",
                requested_currency="USD",
            )
        item = order.items.first()
        # `supplier_reference` is unique — each profile needs its own.
        return EsimProfile.objects.create(
            order_item=item, supplier=self.supplier, status="ready",
            supplier_reference=reference or f"esim_ref_{item.id.hex[:8]}",
        )

    def test_a_poll_records_the_lifecycle_not_just_the_bytes(self):
        profile = self._delivered_profile()
        # `get_supplier_gateway()` builds a NEW FakeSupplier every call, so an attribute
        # set on one instance is invisible to the one `refresh_usage` uses.
        gateway_cls = type(get_supplier_gateway())
        gateway_cls.usage_state = {"smdp_status": "ENABLED", "esim_status": "IN_USE"}
        try:
            esim_services.refresh_usage(profile)
        finally:
            del gateway_cls.usage_state

        profile.refresh_from_db()
        self.assertEqual(profile.status, "active")
        self.assertEqual(profile.smdp_status, "ENABLED")
        self.assertIsNotNone(profile.activated_at)
        self.assertIsNotNone(profile.last_synced_at)

    def test_last_synced_is_recorded_even_when_nothing_moved(self):
        """"Checked, unchanged" and "never checked" look identical on the admin screen
        unless the poll itself is recorded."""
        profile = self._delivered_profile()
        esim_services.refresh_usage(profile)
        profile.refresh_from_db()
        first = profile.last_synced_at
        self.assertIsNotNone(first)

        esim_services.refresh_usage(profile)
        profile.refresh_from_db()
        self.assertGreaterEqual(profile.last_synced_at, first)

    def test_the_sweep_skips_profiles_that_can_no_longer_change(self):
        live = self._delivered_profile()
        dead = self._delivered_profile()
        EsimProfile.objects.filter(pk=dead.pk).update(status="failed")

        refreshed = esim_services.refresh_stale_usage()

        live.refresh_from_db()
        dead.refresh_from_db()
        self.assertEqual(refreshed, 1)
        self.assertIsNotNone(live.last_synced_at)
        self.assertIsNone(dead.last_synced_at)

    def test_the_sweep_leaves_freshly_synced_profiles_alone(self):
        profile = self._delivered_profile()
        EsimProfile.objects.filter(pk=profile.pk).update(last_synced_at=timezone.now())
        self.assertEqual(esim_services.refresh_stale_usage(), 0)

    def test_one_unreachable_profile_does_not_strand_the_others(self):
        """The supplier is a third party. A single bad reference must not stop every
        other customer's usage from updating."""
        good = self._delivered_profile()
        bad = self._delivered_profile()

        gateway_cls = type(get_supplier_gateway())
        original = gateway_cls.get_usage

        def flaky(self, *, supplier_reference):
            if supplier_reference == "boom":
                raise RuntimeError("supplier unreachable")
            return original(self, supplier_reference=supplier_reference)

        EsimProfile.objects.filter(pk=bad.pk).update(supplier_reference="boom")
        gateway_cls.get_usage = flaky
        try:
            refreshed = esim_services.refresh_stale_usage()
        finally:
            gateway_cls.get_usage = original

        good.refresh_from_db()
        self.assertEqual(refreshed, 1)
        self.assertIsNotNone(good.last_synced_at)


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class RefreshUsageErrorSurfacingTests(TestCase):
    """A supplier that answers unhelpfully must not look like our crash.

    The refresh button returned a bare 500 — "An unexpected error occurred" — which
    cannot distinguish a reference the supplier does not know from a response key we are
    not reading from a payload field they have started requiring. All three send an
    operator to the server logs for something the provider already explained in words.
    """

    def setUp(self):
        from apps.administration.tests.test_admin_api import platform_user

        self.admin = platform_user("ops@example.com", "platform_admin")

    def test_supplier_failure_is_a_502_carrying_the_reason(self):
        from apps.esims.supplier import SupplierError
        from rest_framework.test import APIClient

        supplier = Supplier.objects.create(
            code="esim-access", name="eSIM Access", status="active"
        )
        country = Country.objects.create(
            iso2="DE", name="Germany", slug="germany", region="Europe", is_active=True
        )
        plan = CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="DE-1GB",
            supplier_package_code="PKG-DE", plan_type="fixed", display_name="1GB",
            data_limit_mb=1000, validity_days=7, retail_amount_minor=399,
            wholesale_amount_minor=200, currency="USD", status="active",
        )
        with transaction.atomic():
            order = order_services.create_order(
                lines=[order_services.OrderLine(catalog_plan_id=plan.id, quantity=1)],
                customer_email="buyer@example.com", requested_currency="USD",
            )
        profile = EsimProfile.objects.create(
            order_item=order.items.first(), supplier=supplier, status="ready",
            supplier_reference="ref_broken",
        )

        gateway_cls = type(get_supplier_gateway())
        original = gateway_cls.get_usage

        def boom(self, *, supplier_reference):
            raise SupplierError("usage query returned no rows — response keys: ['x']")

        gateway_cls.get_usage = boom
        try:
            client = APIClient()
            client.force_authenticate(self.admin)
            response = client.post(f"/api/v1/admin/esims/{profile.id}/refresh-usage/")
        finally:
            gateway_cls.get_usage = original

        self.assertEqual(response.status_code, 502)
        self.assertIn("response keys", response.data["error"]["message"])
