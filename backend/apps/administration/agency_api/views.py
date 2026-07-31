"""Travel-agency panel views.

Every view is agency-scoped: :class:`IsAgencyMember` resolves ``organization_id`` from the
URL, attaches ``request.tenant``, and 404s for anyone who is not an active member of an
active organization. Querysets then filter on ``request.tenant`` — never on a value taken
from the request body.

The panel is **reporting-only** (plan §0). Agencies do not create orders, do not manage
customers, and never see eSIM credentials.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import OrganizationMember, PartnerCommission
from apps.administration import roles, tenancy
from apps.administration.permissions import HasAgencyCapability, IsAgencyMember
from apps.administration.services import members as member_services
from apps.administration.services import reports as report_services
from apps.common.exceptions import Conflict
from apps.orders.models import PromoCode

from .serializers import (
    AgencyActivitySerializer,
    AgencyAddMemberSerializer,
    AgencyCommissionSerializer,
    AgencyMemberSerializer,
    AgencyPayoutSerializer,
    AgencyProfileSerializer,
    AgencyReferralSaleSerializer,
    AgencyTrackingCodeSerializer,
    AgencyUpdateMemberSerializer,
)

User = get_user_model()


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
    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        return Response(AgencyProfileSerializer(request.tenant).data)

    def patch(self, request, organization_id):
        # Editing requires a stronger capability than viewing.
        if not roles.has_agency_capability(request.membership.role, roles.MANAGE_PROFILE):
            raise Conflict(
                message="Your role does not permit editing the profile.",
                error_code="permission_denied", status_code=403,
            )
        from apps.administration.audit import diff as audit_diff
        from apps.administration.audit import model_snapshot, record_audit

        before = model_snapshot(request.tenant)
        serializer = AgencyProfileSerializer(
            request.tenant, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        organization = serializer.save()
        record_audit(
            action="organization.profile_updated",
            actor=request.user, organization=organization, obj=organization,
            changes=audit_diff(before, model_snapshot(organization)), request=request,
        )
        return Response(AgencyProfileSerializer(organization).data)


# --- Staff ---------------------------------------------------------------------------

class AgencyMemberListView(AgencyAPIView):
    required_capability = roles.VIEW_DASHBOARD

    def get(self, request, organization_id):
        memberships = (
            OrganizationMember.objects.filter(organization=request.tenant)
            .select_related("user")
            .order_by("created_at")
        )
        return Response(AgencyMemberSerializer(memberships, many=True).data)

    def post(self, request, organization_id):
        if not roles.has_agency_capability(request.membership.role, roles.MANAGE_STAFF):
            raise Conflict(
                message="Your role does not permit managing staff.",
                error_code="permission_denied", status_code=403,
            )
        payload = AgencyAddMemberSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = User.objects.filter(email=payload.validated_data["email"]).first()
        if user is None:
            raise Conflict(
                message="No account exists for that email address.",
                error_code="not_found", status_code=404,
            )
        membership = member_services.add_member(
            request.tenant, user, role=payload.validated_data["role"],
            actor=request.user, actor_role=request.membership.role, request=request,
        )
        return Response(AgencyMemberSerializer(membership).data, status=201)


class AgencyMemberDetailView(AgencyAPIView):
    required_capability = roles.MANAGE_STAFF

    def _membership(self, request, member_id):
        # Scoped to the resolved tenant, so another agency's member is simply absent.
        return get_object_or_404(
            OrganizationMember.objects.select_related("user", "organization"),
            pk=member_id, organization=request.tenant,
        )

    def patch(self, request, organization_id, member_id):
        membership = self._membership(request, member_id)
        payload = AgencyUpdateMemberSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if "role" in payload.validated_data:
            membership = member_services.set_member_role(
                membership, role=payload.validated_data["role"], actor=request.user,
                actor_role=request.membership.role, request=request,
            )
        if "status" in payload.validated_data:
            membership = member_services.set_member_status(
                membership, status=payload.validated_data["status"], actor=request.user,
                actor_role=request.membership.role, request=request,
            )
        return Response(AgencyMemberSerializer(membership).data)

    def delete(self, request, organization_id, member_id):
        membership = self._membership(request, member_id)
        member_services.remove_member(
            membership, actor=request.user, actor_role=request.membership.role,
            request=request,
        )
        return Response(status=204)


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
