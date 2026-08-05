"""Travel-agency panel views.

Every view is agency-scoped: :class:`IsAgencyMember` resolves ``organization_id`` from the
URL, attaches ``request.tenant``, and 404s for anyone who is not an active member of an
active organization. Querysets then filter on ``request.tenant`` — never on a value taken
from the request body.

The panel is **reporting-only** (plan §0). Agencies do not create orders, do not manage
customers, and never see eSIM credentials.
"""

from django.db.models import Count, Prefetch, Q
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import OrganizationMember, PartnerCommission
from apps.administration import roles, tenancy
from apps.administration.permissions import HasAgencyCapability, IsAgencyMember
from apps.administration.services import reports as report_services
from apps.orders.models import PromoCode

from .serializers import (
    AgencyActivitySerializer,
    AgencyCommissionSerializer,
    AgencyMemberSerializer,
    AgencyPayoutSerializer,
    AgencyProfileSerializer,
    AgencyReferralSaleSerializer,
    AgencyTrackingCodeSerializer,
)


class AgencyAPIView(APIView):
    permission_classes = [IsAgencyMember, HasAgencyCapability]
    throttle_scope = "agency"
    required_capability = None


class AgencyListView(ListAPIView):
    permission_classes = [IsAgencyMember, HasAgencyCapability]
    throttle_scope = "agency"
    required_capability = None


# --- Dashboard and reports -----------------------------------------------------------

class AgencyDashboardView(AgencyAPIView):
    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        return Response(report_services.agency_dashboard(request.tenant))


class AgencyRevenueReportView(AgencyAPIView):
    required_capability = roles.VIEW_REPORTS

    def get(self, request, organization_id):
        return Response(
            {"series": report_services.agency_revenue_timeseries(request.tenant)}
        )


# --- Profile -------------------------------------------------------------------------

class AgencyProfileView(AgencyAPIView):
    """Read-only. The platform owns every agency record.

    An agency exists to see what its referral code sold; it changes nothing about
    itself. Name, billing address and commission terms are commercial terms set by
    the platform, so they are edited from the platform admin API only.
    """

    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        return Response(AgencyProfileSerializer(request.tenant).data)


# --- Staff ---------------------------------------------------------------------------

class AgencyMemberListView(AgencyAPIView):
    """Read-only. Every agency login is issued by the platform.

    An agency cannot create, change or remove its own logins. Allowing it would mean
    credentials existed that the platform never issued, and the previous write path
    could attach *any* existing customer email to the organisation without that
    person's consent — which also silently changed how they were allowed to log in.
    """

    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        memberships = (
            OrganizationMember.objects.filter(organization=request.tenant)
            .select_related("user")
            .order_by("created_at")
        )
        return Response(AgencyMemberSerializer(memberships, many=True).data)


# --- Sales, commissions, payouts -----------------------------------------------------

class AgencySalesView(AgencyListView):
    """Sales attributed to this agency. No customer identity is exposed."""

    required_capability = roles.VIEW_REPORTS
    serializer_class = AgencyReferralSaleSerializer

    def get_queryset(self):
        return (
            tenancy.agency_referral_orders(self.request.tenant)
            .prefetch_related(
                Prefetch(
                    "commissions",
                    queryset=PartnerCommission.objects.filter(
                        organization=self.request.tenant
                    ),
                    to_attr="_prefetched_commissions",
                )
            )
            .order_by("-created_at")
        )


class AgencyCommissionListView(AgencyListView):
    required_capability = roles.VIEW_COMMISSIONS
    serializer_class = AgencyCommissionSerializer

    def get_queryset(self):
        queryset = tenancy.agency_commissions(self.request.tenant).select_related("order")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")


class AgencyPayoutListView(AgencyListView):
    required_capability = roles.VIEW_COMMISSIONS
    serializer_class = AgencyPayoutSerializer

    def get_queryset(self):
        return tenancy.agency_payouts(self.request.tenant).order_by("-created_at")


class AgencyTrackingCodeListView(AgencyAPIView):
    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        codes = (
            PromoCode.objects.filter(organization=request.tenant)
            .annotate(
                redemption_count=Count(
                    "redemptions", filter=Q(redemptions__status="consumed")
                )
            )
            .order_by("-created_at")
        )
        return Response(AgencyTrackingCodeSerializer(codes, many=True).data)


class AgencyActivityView(AgencyListView):
    """This agency's own audit trail — never platform-internal events."""

    required_capability = roles.VIEW_ACTIVITY
    serializer_class = AgencyActivitySerializer

    def get_queryset(self):
        return tenancy.agency_audit_events(self.request.tenant).order_by("-created_at")
