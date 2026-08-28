"""Discount promo codes in the admin panel.

The pipeline that applies a discount already existed and is covered in apps.orders; what
was missing was any way to CREATE a code outside Django's own admin. These tests cover the
new surface, and — because a code that lists correctly but does not discount is worthless —
one end-to-end case that takes a code created through the API and checks the money.
"""

from decimal import Decimal

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.administration.models import AuditEvent
from apps.orders import services as order_services
from apps.orders.models import PromoCode

from .test_admin_api import platform_user
from .test_admin_read_api import ADMIN, build_catalogue, place_order

URL = f"{ADMIN}/promo-codes/"


@override_settings(SUPPLIER_GATEWAY="fake", PAYMENTS_GATEWAY="fake")
class AdminPromoCodeTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.admin = platform_user("pricing@example.com", "platform_admin")
        self.support = platform_user("support@example.com", "support_admin")
        self.finance = platform_user("fin@example.com", "finance_admin")

    def _create(self, **overrides):
        self.client.force_authenticate(self.admin)
        body = {"code": "SAVE10", "percent_off": "10"}
        body.update(overrides)
        return self.client.post(URL, body, format="json")

    # ---- creating ----

    def test_admin_creates_a_percentage_code(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], "SAVE10")
        self.assertEqual(response.data["percent_off"], 10.0)
        self.assertTrue(response.data["is_active"])

    def test_percent_is_stored_as_basis_points(self):
        """Operators type 10; the column holds 1000. Getting this backwards is a 100x
        pricing error in whichever direction it lands."""
        self._create(percent_off="10")
        promo = PromoCode.objects.get(code="SAVE10")
        self.assertEqual(promo.discount_value, 1000)
        self.assertEqual(promo.discount_type, "percentage_bps")

    def test_a_fractional_percentage_survives_the_conversion(self):
        self._create(code="HALF", percent_off="12.5")
        self.assertEqual(PromoCode.objects.get(code="HALF").discount_value, 1250)

    def test_created_code_is_a_discount_with_no_agency_attached(self):
        """A discount code must not also claim commission — that would cost margin twice
        on the same sale, and would trip `promo_agency_requires_commission`."""
        self._create()
        promo = PromoCode.objects.get(code="SAVE10")
        self.assertEqual(promo.kind, "discount")
        self.assertIsNone(promo.organization)
        self.assertIsNone(promo.commission_value)

    def test_rejects_a_duplicate_code_case_insensitively(self):
        self._create(code="SAVE10")
        response = self._create(code="save10")
        self.assertEqual(response.status_code, 400)

    def test_rejects_zero_and_over_one_hundred_percent(self):
        self.assertEqual(self._create(code="ZERO", percent_off="0").status_code, 400)
        self.assertEqual(self._create(code="TOOBIG", percent_off="101").status_code, 400)

    def test_rejects_a_code_with_spaces(self):
        self.assertEqual(self._create(code="TWO WORDS").status_code, 400)

    def test_rejects_an_end_date_before_the_start(self):
        response = self._create(
            starts_at="2026-12-01T00:00:00Z", ends_at="2026-11-01T00:00:00Z"
        )
        self.assertEqual(response.status_code, 400)

    def test_writes_an_audit_event(self):
        self._create()
        self.assertTrue(AuditEvent.objects.filter(action="promo_code.created").exists())

    # ---- authorization ----

    def test_support_cannot_mint_a_discount_code(self):
        """Support can help a customer but must not give away margin."""
        self.client.force_authenticate(self.support)
        response = self.client.post(URL, {"code": "FREE", "percent_off": "100"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(PromoCode.objects.filter(code="FREE").exists())

    def test_finance_cannot_mint_a_discount_code(self):
        self.client.force_authenticate(self.finance)
        response = self.client.post(URL, {"code": "FREE", "percent_off": "50"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_list(self):
        response = self.client.get(URL)
        self.assertIn(response.status_code, (401, 403))

    # ---- listing ----

    def test_list_excludes_agency_tracking_codes(self):
        """Tracking codes share the table but are a different product — they carry no
        discount and belong to an agency. Showing them here invites someone to edit a
        referral code expecting it to discount."""
        from apps.accounts.models import Organization
        from apps.accounts.services import create_agency_tracking_code

        org = Organization.objects.create(
            name="Sunrise", organization_type="travel_agency",
            billing_email="s@s.com", status="active",
        )
        create_agency_tracking_code(org, code="TRACKME", commission_bps=2000)
        self._create()

        self.client.force_authenticate(self.admin)
        codes = [row["code"] for row in self.client.get(URL).data["results"]]
        self.assertIn("SAVE10", codes)
        self.assertNotIn("TRACKME", codes)

    def test_usage_shown_counts_reservations_not_just_settled_orders(self):
        """The count is displayed against `usage_limit`, and the limit counts a RESERVED
        redemption. Counting only `consumed` shows "0 of 3" on a code with a use already
        held — so an operator sees room that does not exist, and a customer hitting the
        limit looks like a checkout bug."""
        self._create(code="HELDUSE", percent_off="10", usage_limit=3)
        place_order(email="holder@example.com", promo="HELDUSE")  # unpaid: reserved

        self.client.force_authenticate(self.admin)
        row = self.client.get(f"{URL}?search=HELDUSE").data["results"][0]
        self.assertEqual(row["redemption_count"], 1)

    # ---- managing ----

    def test_deactivating_a_code_stops_it_working(self):
        self._create()
        promo = PromoCode.objects.get(code="SAVE10")
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"{URL}{promo.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

    def test_the_code_string_itself_cannot_be_changed(self):
        """A shared code is an identifier people already hold; renaming it breaks every
        link carrying it and orphans the redemptions."""
        self._create()
        promo = PromoCode.objects.get(code="SAVE10")
        self.client.force_authenticate(self.admin)
        self.client.patch(f"{URL}{promo.id}/", {"code": "RENAMED"}, format="json")
        promo.refresh_from_db()
        self.assertEqual(promo.code, "SAVE10")

    def test_editing_the_percentage(self):
        self._create()
        promo = PromoCode.objects.get(code="SAVE10")
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"{URL}{promo.id}/", {"percent_off": "25"}, format="json")
        self.assertEqual(response.data["percent_off"], 25.0)
        promo.refresh_from_db()
        self.assertEqual(promo.discount_value, 2500)

    def test_support_cannot_edit(self):
        self._create()
        promo = PromoCode.objects.get(code="SAVE10")
        self.client.force_authenticate(self.support)
        response = self.client.patch(f"{URL}{promo.id}/", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 403)

    # ---- the money ----

    def test_a_code_created_here_actually_discounts_a_real_order(self):
        """The whole point. A code that lists beautifully and does not reduce the total
        is worse than no feature at all, because it looks like it worked."""
        self._create(code="TENOFF", percent_off="10")

        preview = order_services.preview_direct_promo(
            items=[{"product_code": "FR-5GB-30D", "quantity": 1}],
            promo_code="TENOFF",
            customer_email="buyer@example.com",
            requested_currency="USD",
        )
        self.assertEqual(preview["kind"], "discount")
        self.assertEqual(preview["discount_minor"], preview["subtotal_minor"] // 10)
        self.assertEqual(
            preview["total_minor"], preview["subtotal_minor"] - preview["discount_minor"]
        )

    def test_a_real_order_placed_with_the_code_is_actually_cheaper(self):
        """Not a preview — a real order through checkout, with the money asserted on the
        stored row. The preview mirrors this arithmetic, but a code that previews a
        discount and charges full price is exactly the failure a preview cannot catch."""
        self._create(code="REAL15", percent_off="15")

        full = place_order(email="full@example.com")
        discounted = place_order(email="cheap@example.com", promo="REAL15")

        self.assertEqual(discounted.subtotal_minor, full.subtotal_minor)
        self.assertEqual(discounted.discount_minor, full.subtotal_minor * 15 // 100)
        self.assertEqual(
            discounted.total_minor,
            discounted.subtotal_minor - discounted.discount_minor,
        )
        self.assertLess(discounted.total_minor, full.total_minor)
        self.assertEqual(discounted.promo_code_snapshot, "REAL15")

    def test_the_reserved_use_counts_against_the_usage_limit(self):
        """A one-use code must be spent by the first order, not the first payment."""
        self._create(code="ONEONLY", percent_off="10", usage_limit=1)
        place_order(email="first@example.com", promo="ONEONLY")

        from apps.common.exceptions import PromoUsageExceeded

        with self.assertRaises(PromoUsageExceeded):
            place_order(email="second@example.com", promo="ONEONLY")

    def test_a_deactivated_code_is_refused_at_checkout(self):
        self._create(code="OFFNOW", percent_off="10")
        promo = PromoCode.objects.get(code="OFFNOW")
        self.client.force_authenticate(self.admin)
        self.client.patch(f"{URL}{promo.id}/", {"is_active": False}, format="json")

        from apps.common.exceptions import PromoInvalid

        with self.assertRaises(PromoInvalid):
            order_services.preview_direct_promo(
                items=[{"product_code": "FR-5GB-30D", "quantity": 1}],
                promo_code="OFFNOW",
                customer_email="buyer@example.com",
                requested_currency="USD",
            )
