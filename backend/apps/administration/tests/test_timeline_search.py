"""The order timeline and the global search box.

Both are read-only assembly over data that already existed. The value is entirely in
putting it in one place: support had to open five screens to answer "what happened to
this order", and had to guess which tab an identifier belonged to before they could
search at all.
"""

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.orders.models import Order, PromoCode

from .test_admin_api import platform_user
from .test_admin_read_api import ADMIN, build_catalogue, place_order, settle


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class OrderTimelineTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.admin = platform_user("ops3@example.com", "platform_admin")
        self.client.force_authenticate(self.admin)

    def _timeline(self, order):
        return self.client.get(f"{ADMIN}/orders/{order.id}/timeline/").data["entries"]

    def test_a_new_order_has_its_placement_recorded(self):
        order = place_order()
        labels = [e["label"] for e in self._timeline(order)]
        self.assertIn("Order placed", labels)

    def test_a_settled_order_shows_payment_provisioning_and_delivery_together(self):
        """The whole point: five tables, one story."""
        order = place_order()
        settle(order)
        kinds = {e["kind"] for e in self._timeline(order)}
        self.assertIn("payment", kinds)
        self.assertIn("supplier", kinds)
        self.assertIn("esim", kinds)

    def test_entries_are_oldest_first(self):
        order = place_order()
        settle(order)
        stamps = [e["at"] for e in self._timeline(order)]
        self.assertEqual(stamps, sorted(stamps))

    def test_an_event_that_never_happened_is_absent_not_first(self):
        """A NULL `paid_at` means it did not happen. Sorting it to the front would read
        as though it happened before everything else."""
        order = place_order()
        for entry in self._timeline(order):
            self.assertIsNotNone(entry["at"])
            self.assertNotEqual(entry["label"], "Payment settled")

    def test_a_promo_is_shown_with_what_it_actually_did(self):
        PromoCode.objects.create(
            code="TEN", kind="discount", discount_type="percentage_bps",
            discount_value=1000, is_active=True,
        )
        order = place_order(promo="TEN")
        promo_entries = [e for e in self._timeline(order) if e["kind"] == "promo"]
        self.assertTrue(promo_entries)
        self.assertIn("Discount", promo_entries[0]["detail"])

    def test_never_exposes_activation_credentials(self):
        """A debugging view must not become the way around the audited reveal endpoint."""
        order = place_order()
        settle(order)
        body = str(self._timeline(order)).lower()
        for secret in ("iccid", "activation", "qr_payload", "lpa:", "smdp"):
            self.assertNotIn(secret, body)


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class AdminSearchTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.admin = platform_user("ops4@example.com", "platform_admin")
        self.client.force_authenticate(self.admin)
        self.order = place_order(email="findme@example.com")
        settle(self.order)

    def _search(self, term):
        return self.client.get(f"{ADMIN}/search/?q={term}").data

    def test_finds_an_order_by_its_number(self):
        result = self._search(self.order.order_number)
        self.assertEqual(result["orders"][0]["order_number"], self.order.order_number)

    def test_finds_an_order_by_customer_email(self):
        result = self._search("findme@example.com")
        self.assertTrue(result["orders"])

    def test_finds_an_esim_by_the_last_four_of_its_iccid(self):
        """`iccid_last4` exists so a support conversation can identify an eSIM without
        anybody handling the full number. The encrypted column is never touched."""
        from apps.esims.models import EsimProfile

        profile = EsimProfile.objects.filter(order_item__order=self.order).first()
        self.assertIsNotNone(profile)
        EsimProfile.objects.filter(pk=profile.pk).update(iccid_last4="4321")
        result = self._search("4321")
        self.assertTrue(result["esims"])

    def test_a_short_term_returns_nothing_rather_than_everything(self):
        """Two characters match most of the database and answer nothing."""
        result = self._search("ab")
        self.assertEqual(result["orders"], [])
        self.assertEqual(result["customers"], [])
        self.assertEqual(result["esims"], [])

    def test_results_are_capped(self):
        for i in range(8):
            place_order(email=f"bulk{i}@example.com")
        self.assertLessEqual(len(self._search("bulk")["orders"]), 5)

    def test_a_miss_is_empty_not_an_error(self):
        result = self._search("nothingmatchesthis")
        self.assertEqual(result["orders"], [])

    def test_readonly_admin_can_search(self):
        """It reads only what VIEW_ORDER already grants."""
        readonly = platform_user("ro3@example.com", "readonly_admin")
        self.client.force_authenticate(readonly)
        self.assertEqual(self.client.get(f"{ADMIN}/search/?q=findme").status_code, 200)
