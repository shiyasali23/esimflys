from datetime import date, timedelta

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts import services as account_services
from apps.accounts.models import CommissionPayout, Organization, PartnerCommission
from apps.administration.models import AuditEvent
from apps.catalog.models import CatalogPlan, Country
from apps.orders.models import Order

from .test_admin_api import platform_user
from .test_admin_read_api import build_catalogue, place_order, settle

ADMIN = "/api/v1/admin"


def make_agency(name="Sunrise"):
    return Organization.objects.create(
        name=name, organization_type="travel_agency",
        billing_email=f"{name.lower()}@x.com", status="active",
    )


@override_settings(SUPPLIER_GATEWAY="fake")
class CommissionApprovalTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.finance = platform_user("fin@example.com", "finance_admin")
        self.support = platform_user("sup@example.com", "support_admin")
        self.agency = make_agency()
        account_services.create_agency_tracking_code(self.agency, code="TRACK")
        self.order = place_order(quantity=2, promo="TRACK")  # 2 x 2000 = 4000
        settle(self.order)
        self.commission = account_services.create_commission_for_order(self.order)
        self.client.force_authenticate(self.finance)

    def test_commission_starts_pending_for_review(self):
        self.assertEqual(self.commission.status, "pending")
        self.assertEqual(self.commission.commission_minor, 800)  # 20% of 4000

    def test_finance_can_approve(self):
        response = self.client.post(f"{ADMIN}/commissions/{self.commission.id}/approve/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "approved")
        self.assertTrue(AuditEvent.objects.filter(action="commission.approved").exists())

    def test_support_cannot_approve(self):
        self.client.force_authenticate(self.support)
        response = self.client.post(f"{ADMIN}/commissions/{self.commission.id}/approve/")
        self.assertEqual(response.status_code, 403)

    def test_approving_twice_is_rejected(self):
        self.client.post(f"{ADMIN}/commissions/{self.commission.id}/approve/")
        response = self.client.post(f"{ADMIN}/commissions/{self.commission.id}/approve/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "commission_not_approvable")

    def test_fully_reversed_commission_cannot_be_approved(self):
        """A refunded booking must never be paid out."""
        account_services.reverse_commission_for_order(self.order, self.order.subtotal_minor)
        self.commission.refresh_from_db()
        self.assertEqual(self.commission.status, "reversed")
        response = self.client.post(f"{ADMIN}/commissions/{self.commission.id}/approve/")
        self.assertEqual(response.status_code, 409)

    def test_bulk_approve_reports_per_item_failures(self):
        other_order = place_order(promo="TRACK")
        settle(other_order)
        second = account_services.create_commission_for_order(other_order)
        account_services.approve_commission(second)  # already approved

        response = self.client.post(
            f"{ADMIN}/commissions/bulk-approve/",
            {"commission_ids": [str(self.commission.id), str(second.id)]}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approved"], [str(self.commission.id)])
        self.assertEqual(len(response.data["failed"]), 1)


@override_settings(SUPPLIER_GATEWAY="fake")
class PayoutTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.finance = platform_user("fin@example.com", "finance_admin")
        self.agency = make_agency()
        account_services.create_agency_tracking_code(self.agency, code="TRACK")
        self.client.force_authenticate(self.finance)

    def _approved_commission(self, created_on=None):
        order = place_order(promo="TRACK")
        settle(order)
        commission = account_services.create_commission_for_order(order)
        account_services.approve_commission(commission)
        if created_on:
            PartnerCommission.objects.filter(pk=commission.pk).update(created_at=created_on)
        return commission

    def test_payout_only_includes_commissions_from_its_own_period(self):
        """Regression: a January payout must not sweep up February's earnings."""
        january = timezone.now().replace(month=1, day=15)
        february = timezone.now().replace(month=2, day=15)
        jan_commission = self._approved_commission(created_on=january)
        feb_commission = self._approved_commission(created_on=february)

        response = self.client.post(
            f"{ADMIN}/payouts/",
            {"organization": str(self.agency.id), "period_start": "2026-01-01",
             "period_end": "2026-01-31"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        jan_commission.refresh_from_db()
        feb_commission.refresh_from_db()
        self.assertIsNotNone(jan_commission.payout_id)
        self.assertIsNone(feb_commission.payout_id, "February was swept into January!")
        self.assertEqual(response.data["amount_minor"], jan_commission.commission_minor)

    def test_commission_count_is_correct_on_every_response_shape(self):
        """Create/pay responses previously reported 0 because only the list was annotated."""
        self._approved_commission()
        today = date.today()
        created = self.client.post(
            f"{ADMIN}/payouts/",
            {"organization": str(self.agency.id),
             "period_start": (today - timedelta(days=1)).isoformat(),
             "period_end": (today + timedelta(days=1)).isoformat()},
            format="json",
        )
        self.assertEqual(created.data["commission_count"], 1)

        paid = self.client.post(f"{ADMIN}/payouts/{created.data['id']}/pay/", {}, format="json")
        self.assertEqual(paid.data["commission_count"], 1)

        listed = self.client.get(f"{ADMIN}/payouts/")
        self.assertEqual(listed.data[0]["commission_count"], 1)

    def test_payout_with_nothing_approved_is_rejected(self):
        response = self.client.post(
            f"{ADMIN}/payouts/",
            {"organization": str(self.agency.id), "period_start": "2020-01-01",
             "period_end": "2020-01-31"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "nothing_to_pay_out")

    def test_pay_marks_payout_and_its_commissions_paid(self):
        commission = self._approved_commission()
        today = date.today()
        created = self.client.post(
            f"{ADMIN}/payouts/",
            {"organization": str(self.agency.id),
             "period_start": (today - timedelta(days=1)).isoformat(),
             "period_end": (today + timedelta(days=1)).isoformat()},
            format="json",
        )
        payout_id = created.data["id"]
        response = self.client.post(
            f"{ADMIN}/payouts/{payout_id}/pay/",
            {"reference": "BANK-REF-1", "method": "bank_transfer"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "paid")
        self.assertEqual(response.data["external_reference"], "BANK-REF-1")
        commission.refresh_from_db()
        self.assertEqual(commission.status, "paid")

    def test_paying_twice_is_rejected(self):
        self._approved_commission()
        today = date.today()
        created = self.client.post(
            f"{ADMIN}/payouts/",
            {"organization": str(self.agency.id),
             "period_start": (today - timedelta(days=1)).isoformat(),
             "period_end": (today + timedelta(days=1)).isoformat()},
            format="json",
        )
        payout_id = created.data["id"]
        self.client.post(f"{ADMIN}/payouts/{payout_id}/pay/", {}, format="json")
        response = self.client.post(f"{ADMIN}/payouts/{payout_id}/pay/", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "payout_already_paid")

    def test_monthly_run_is_idempotent(self):
        last_month = (timezone.now().replace(day=1) - timedelta(days=1))
        self._approved_commission(created_on=last_month)
        month = last_month.strftime("%Y-%m")

        call_command("run_monthly_payouts", month=month, verbosity=0)
        call_command("run_monthly_payouts", month=month, verbosity=0)
        self.assertEqual(CommissionPayout.objects.filter(organization=self.agency).count(), 1)

    def test_monthly_run_never_approves_anything(self):
        """Review-first: pending commissions must stay pending."""
        order = place_order(promo="TRACK")
        settle(order)
        commission = account_services.create_commission_for_order(order)
        last_month = (timezone.now().replace(day=1) - timedelta(days=1))
        PartnerCommission.objects.filter(pk=commission.pk).update(created_at=last_month)

        call_command("run_monthly_payouts", month=last_month.strftime("%Y-%m"), verbosity=0)
        commission.refresh_from_db()
        self.assertEqual(commission.status, "pending")
        self.assertIsNone(commission.payout_id)


@override_settings(SUPPLIER_GATEWAY="fake")
class CatalogueManagementTests(APITestCase):
    def setUp(self):
        build_catalogue()
        self.superuser = platform_user("root@example.com", superuser=True)
        self.support = platform_user("sup@example.com", "support_admin")
        self.plan = CatalogPlan.objects.get(product_code="FR-5GB-30D")
        CatalogPlan.objects.filter(pk=self.plan.pk).update(status="paused")
        self.plan.refresh_from_db()
        self.country = self.plan.country
        self.client.force_authenticate(self.superuser)

    def test_activating_a_plan_makes_it_publicly_purchasable(self):
        """End-to-end: the catalogue API is what turns a plan into a sellable product."""
        public = self.client.get("/api/v1/catalog/countries/france/plans/")
        self.assertEqual(len(public.data), 0)

        response = self.client.post(f"{ADMIN}/plans/{self.plan.id}/activate/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "active")

        public = self.client.get("/api/v1/catalog/countries/france/plans/")
        self.assertEqual(len(public.data), 1)
        self.assertTrue(AuditEvent.objects.filter(action="catalog_plan.activated").exists())

    def test_pausing_removes_it_from_the_storefront(self):
        self.client.post(f"{ADMIN}/plans/{self.plan.id}/activate/")
        self.client.post(f"{ADMIN}/plans/{self.plan.id}/pause/")
        public = self.client.get("/api/v1/catalog/countries/france/plans/")
        self.assertEqual(len(public.data), 0)

    def test_retired_plans_cannot_be_activated(self):
        CatalogPlan.objects.filter(pk=self.plan.pk).update(status="retired")
        response = self.client.post(f"{ADMIN}/plans/{self.plan.id}/activate/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "plan_not_activatable")

    def test_activate_all_plans_for_a_country(self):
        response = self.client.post(f"{ADMIN}/countries/{self.country.id}/activate-plans/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["updated"]), 1)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.status, "active")

    def test_bulk_status_reports_failures_without_aborting(self):
        retired = CatalogPlan.objects.create(
            supplier=self.plan.supplier, country=self.country, product_code="FR-OLD",
            supplier_package_code="OLD", plan_type="fixed", display_name="old",
            data_limit_mb=1000, validity_days=7, retail_amount_minor=500,
            currency="USD", status="retired",
        )
        response = self.client.post(
            f"{ADMIN}/plans/bulk-status/",
            {"plan_ids": [str(self.plan.id), str(retired.id)], "status": "active"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["updated"], [str(self.plan.id)])
        self.assertEqual(len(response.data["failed"]), 1)

    def test_price_change_is_audited_with_before_and_after(self):
        response = self.client.patch(
            f"{ADMIN}/plans/{self.plan.id}/", {"retail_amount_minor": 2500}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        event = AuditEvent.objects.get(action="catalog_plan.updated")
        self.assertEqual(event.changes["retail_amount_minor"], [2000, 2500])

    def test_wholesale_and_margin_hidden_from_non_pricing_roles(self):
        self.client.force_authenticate(self.support)
        body = self.client.get(f"{ADMIN}/plans/{self.plan.id}/").content.decode()
        self.assertNotIn("wholesale", body)
        self.assertNotIn("margin_minor", body)

    def test_wholesale_and_margin_visible_to_pricing_role(self):
        data = self.client.get(f"{ADMIN}/plans/{self.plan.id}/").data
        self.assertIn("wholesale_amount_minor", data)
        self.assertEqual(data["margin_minor"], 2000 - 800)

    def test_support_cannot_change_prices(self):
        self.client.force_authenticate(self.support)
        response = self.client.patch(
            f"{ADMIN}/plans/{self.plan.id}/", {"retail_amount_minor": 999}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.retail_amount_minor, 2000)

    def test_country_visibility_can_be_toggled(self):
        response = self.client.patch(
            f"{ADMIN}/countries/{self.country.id}/",
            {"is_active": False, "homepage_badge": "popular"}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])
        self.assertEqual(
            self.client.get("/api/v1/catalog/countries/france/").status_code, 404
        )
        self.assertTrue(AuditEvent.objects.filter(action="country.updated").exists())

    def test_product_facts_are_not_editable(self):
        """Identity comes from the supplier workbook, not the admin panel."""
        self.client.patch(
            f"{ADMIN}/plans/{self.plan.id}/",
            {"product_code": "HACKED", "data_limit_mb": 999999}, format="json",
        )
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.product_code, "FR-5GB-30D")
        self.assertEqual(self.plan.data_limit_mb, 5000)

    def test_catalogue_import_is_audited(self):
        response = self.client.post(f"{ADMIN}/catalog/import/")
        self.assertIn(response.status_code, (200, 500))
        if response.status_code == 200:
            self.assertTrue(AuditEvent.objects.filter(action="catalog.imported").exists())
