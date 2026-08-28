"""Platform admin API views.

Every view declares ``required_capability``; :class:`HasPlatformCapability` raises
``ImproperlyConfigured`` if one is forgotten, so an endpoint can never ship with an
accidentally-open permission.
"""

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services as account_services
from apps.accounts.models import (
    CommissionPayout,
    Organization,
    OrganizationMember,
    PartnerCommission,
)
from apps.accounts.services import create_agency_tracking_code
from apps.administration import roles
from apps.administration.audit import record_audit
from apps.administration.models import AuditEvent
from apps.administration.permissions import HasPlatformCapability, IsPlatformAdmin
from apps.administration.roles import has_platform_capability
from apps.administration.services import catalogue as catalogue_services
from apps.administration.services import members as member_services
from apps.administration.services import operations as operation_services
from apps.administration.services import organizations as organization_services
from apps.administration.services import promos as promo_services
from apps.administration.services import reports as report_services
from apps.catalog.models import CatalogPlan, Country, TopupProduct
from apps.common.exceptions import Conflict, UpstreamUnavailable
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile, SupplierEvent
from apps.esims import supplier as esim_supplier
from apps.esims.supplier import SupplierError
from apps.orders import services as order_services
from apps.orders.models import Notification, Order, PromoCode
from apps.payments import services as payment_services
from apps.payments.models import Payment, Refund

from .serializers import (
    AddMemberSerializer,
    AdminCommissionSerializer,
    AdminCountrySerializer,
    AdminPayoutSerializer,
    AdminPlanSerializer,
    AdminTopupProductSerializer,
    BulkApproveSerializer,
    BulkPlanStatusSerializer,
    CreatePayoutSerializer,
    MarkPayoutPaidSerializer,
    SetMemberPasswordSerializer,
    AdminCustomerSerializer,
    AdminEsimListSerializer,
    AdminNotificationSerializer,
    AdminOrderDetailSerializer,
    AdminOrderListSerializer,
    AdminPaymentSerializer,
    AdminRefundSerializer,
    AdminSupplierEventSerializer,
    AuditEventSerializer,
    CreateRefundSerializer,
    AdminPromoCodeSerializer,
    CreatePromoCodeSerializer,
    IssueTrackingCodeSerializer,
    UpdatePromoCodeSerializer,
    OrganizationCreateSerializer,
    OrganizationMemberSerializer,
    OrganizationSerializer,
    ReasonSerializer,
    SuspendSerializer,
    TrackingCodeSerializer,
    UpdateMemberSerializer,
)

User = get_user_model()


class PlatformAPIView(APIView):
    """Base for platform admin endpoints: authenticated, roled, throttled."""

    permission_classes = [IsPlatformAdmin, HasPlatformCapability]
    throttle_scope = "admin"
    required_capability = None


class PlatformListView(ListAPIView):
    permission_classes = [IsPlatformAdmin, HasPlatformCapability]
    throttle_scope = "admin"
    required_capability = None


class PlatformRetrieveView(RetrieveAPIView):
    permission_classes = [IsPlatformAdmin, HasPlatformCapability]
    throttle_scope = "admin"
    required_capability = None


# --- Organizations -------------------------------------------------------------------

class OrganizationListCreateView(ListCreateAPIView):
    permission_classes = [IsPlatformAdmin, HasPlatformCapability]
    throttle_scope = "admin"
    required_capability = roles.MANAGE_AGENCY

    def get_serializer_class(self):
        return (
            OrganizationCreateSerializer
            if self.request.method == "POST"
            else OrganizationSerializer
        )

    def get_queryset(self):
        queryset = Organization.objects.annotate(
            member_count=Count("members", filter=Q(members__status="active"))
        )
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        org_type = self.request.query_params.get("organization_type")
        if org_type:
            queryset = queryset.filter(organization_type=org_type)
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(billing_email__icontains=search)
            )
        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        from apps.administration.audit import record_audit

        organization = serializer.save()
        record_audit(
            action="organization.created",
            organization=organization,
            obj=organization,
            changes={"name": [None, organization.name]},
            request=self.request,
        )


class OrganizationDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsPlatformAdmin, HasPlatformCapability]
    throttle_scope = "admin"
    required_capability = roles.MANAGE_AGENCY
    serializer_class = OrganizationSerializer
    lookup_field = "id"
    http_method_names = ["get", "patch"]

    def get_queryset(self):
        return Organization.objects.annotate(
            member_count=Count("members", filter=Q(members__status="active"))
        )

    def perform_update(self, serializer):
        from apps.administration.audit import model_snapshot, record_audit
        from apps.administration.audit import diff as audit_diff

        before = model_snapshot(self.get_object())
        organization = serializer.save()
        record_audit(
            action="organization.updated",
            organization=organization,
            obj=organization,
            changes=audit_diff(before, model_snapshot(organization)),
            request=self.request,
        )


class OrganizationTransitionView(PlatformAPIView):
    """Approve / suspend / activate / reject / close an organization."""

    required_capability = roles.MANAGE_AGENCY

    ACTIONS = {
        "approve": organization_services.approve_organization,
        "activate": organization_services.reactivate_organization,
        "reject": organization_services.reject_organization,
        "close": organization_services.close_organization,
    }

    def post(self, request, id, action):
        organization = get_object_or_404(Organization, pk=id)

        if action == "suspend":
            payload = SuspendSerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            organization = organization_services.suspend_organization(
                organization, reason=payload.validated_data["reason"],
                actor=request.user, request=request,
            )
        elif action in self.ACTIONS:
            payload = ReasonSerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            handler = self.ACTIONS[action]
            kwargs = {"actor": request.user, "request": request}
            reason = payload.validated_data.get("reason")
            if action in ("reject", "close"):
                kwargs["reason"] = reason
            organization = handler(organization, **kwargs)
        else:
            raise Conflict(
                message=f"Unknown action '{action}'.",
                error_code="not_found",
                status_code=404,
            )

        return Response(OrganizationSerializer(organization).data)


# --- Organization members ------------------------------------------------------------

class OrganizationMemberListView(PlatformAPIView):
    required_capability = roles.MANAGE_AGENCY

    def get(self, request, id):
        organization = get_object_or_404(Organization, pk=id)
        memberships = (
            OrganizationMember.objects.filter(organization=organization)
            .select_related("user")
            .order_by("created_at")
        )
        return Response(OrganizationMemberSerializer(memberships, many=True).data)

    def post(self, request, id):
        """Add a member, creating their login if it does not exist yet.

        Agencies do not self-register: the platform issues the credentials and passes them
        to the agency out of band. Created accounts are deliberately **never** given
        ``is_staff`` — Django admin has no row-level tenancy and would expose every tenant.
        """
        organization = get_object_or_404(Organization, pk=id)
        payload = AddMemberSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        user = User.objects.filter(email=data["email"]).first()
        created_login = False
        if user is None:
            user = User.objects.create_user(
                email=data["email"],
                password=data["password"],
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
            )
            created_login = True
            record_audit(
                action="user.created_by_admin",
                organization=organization,
                obj=user,
                # The password itself is never recorded — audit the act, not the secret.
                context={"email": user.email, "reason": "agency onboarding"},
                request=request,
            )

        membership = member_services.add_member(
            organization, user, role=data["role"],
            actor=request.user, request=request,
        )
        body = OrganizationMemberSerializer(membership).data
        body["login_created"] = created_login
        return Response(body, status=201)


class OrganizationMemberDetailView(PlatformAPIView):
    required_capability = roles.MANAGE_AGENCY

    def _membership(self, organization_id, member_id):
        return get_object_or_404(
            OrganizationMember.objects.select_related("user", "organization"),
            pk=member_id, organization_id=organization_id,
        )

    def patch(self, request, id, member_id):
        membership = self._membership(id, member_id)
        payload = UpdateMemberSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if "role" in payload.validated_data:
            membership = member_services.set_member_role(
                membership, role=payload.validated_data["role"],
                actor=request.user, request=request,
            )
        if "status" in payload.validated_data:
            membership = member_services.set_member_status(
                membership, status=payload.validated_data["status"],
                actor=request.user, request=request,
            )
        return Response(OrganizationMemberSerializer(membership).data)

    def delete(self, request, id, member_id):
        membership = self._membership(id, member_id)
        member_services.remove_member(membership, actor=request.user, request=request)
        return Response(status=204)


class OrganizationMemberPasswordView(PlatformAPIView):
    """Administrator-issued password reset.

    Agencies cannot change their own credentials, so the platform is the only recovery
    path. Every reset is audited; the password itself is never stored in the trail.
    """

    required_capability = roles.MANAGE_AGENCY

    def post(self, request, id, member_id):
        membership = get_object_or_404(
            OrganizationMember.objects.select_related("user", "organization"),
            pk=member_id, organization_id=id,
        )
        payload = SetMemberPasswordSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        user = membership.user
        user.set_password(payload.validated_data["password"])
        user.save(update_fields=["password", "updated_at"])
        # Force re-authentication: an old session must not outlive the old password.
        _flush_user_sessions(user)

        record_audit(
            action="user.password_reset_by_admin",
            organization=membership.organization,
            obj=user,
            context={"email": user.email},
            request=request,
        )
        return Response({"detail": "Password updated.", "email": user.email})


def _flush_user_sessions(user):
    """Invalidate every active session belonging to a user.

    Django stores sessions opaquely, so each candidate is decoded and matched on the
    authenticated user id.
    """
    user_id = str(user.pk)
    for session in Session.objects.filter(expire_date__gte=timezone.now()):
        if session.get_decoded().get("_auth_user_id") == user_id:
            session.delete()


# --- Referral tracking codes ---------------------------------------------------------

class TrackingCodeListView(PlatformAPIView):
    """List and issue agency referral codes (attribution only, never a discount)."""

    required_capability = roles.MANAGE_AGENCY

    def get(self, request, id):
        organization = get_object_or_404(Organization, pk=id)
        codes = (
            PromoCode.objects.filter(organization=organization)
            .annotate(
                redemption_count=Count(
                    "redemptions", filter=Q(redemptions__status="consumed")
                )
            )
            .select_related("organization")
            .order_by("-created_at")
        )
        return Response(TrackingCodeSerializer(codes, many=True).data)

    def post(self, request, id):
        organization = get_object_or_404(Organization, pk=id)
        payload = IssueTrackingCodeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        promo = create_agency_tracking_code(
            organization,
            code=payload.validated_data["code"],
            commission_bps=payload.validated_data["commission_bps"],
            usage_limit=payload.validated_data.get("usage_limit"),
            ends_at=payload.validated_data.get("ends_at"),
            actor=request.user,
        )
        promo.redemption_count = 0
        return Response(TrackingCodeSerializer(promo).data, status=201)


# --- Discount promo codes ------------------------------------------------------------

class AdminPromoCodeListView(PlatformListView):
    """List and mint percentage-off codes.

    Gated on MANAGE_PLATFORM_PRICING, not MANAGE_ORDER. Minting a discount code gives
    away margin on every sale that uses it, which is a pricing decision — support can
    help a customer but must not be able to create a 100%-off code, and finance handles
    refunds and commissions rather than list price. Only superuser and platform_admin
    hold pricing.

    Scoped to `kind="discount"`. Agency tracking codes share this table but are a
    different product — they carry no discount and belong to an organization — and are
    managed per-agency under Agencies. Mixing them into one list is how someone
    eventually edits a referral code expecting it to discount.
    """

    required_capability = roles.MANAGE_PLATFORM_PRICING
    serializer_class = AdminPromoCodeSerializer

    def get_queryset(self):
        # `reserved` counts too, because that is what the LIMIT counts. `_validate_promo`
        # refuses a code once reserved + consumed reaches `usage_limit`, so counting only
        # `consumed` here shows "2 of 3" on a code that is already exhausted — and the
        # operator goes looking for a bug in checkout instead of finding a held reservation.
        # (The agency tracking list deliberately counts `consumed` alone: an agency is
        # asking how many sales it earned, not how much of a limit is left.)
        queryset = PromoCode.objects.filter(kind="discount").annotate(
            redemption_count=Count(
                "redemptions", filter=Q(redemptions__status__in=["reserved", "consumed"])
            )
        )
        params = self.request.query_params
        active = params.get("is_active")
        if active in ("true", "false"):
            queryset = queryset.filter(is_active=(active == "true"))
        search = params.get("search")
        if search:
            queryset = queryset.filter(code__icontains=search)
        return queryset.order_by("-created_at")

    def post(self, request, *args, **kwargs):
        payload = CreatePromoCodeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        promo = promo_services.create_discount_promo_code(
            code=payload.validated_data["code"],
            percent_off=payload.validated_data["percent_off"],
            usage_limit=payload.validated_data.get("usage_limit"),
            per_customer_limit=payload.validated_data.get("per_customer_limit"),
            starts_at=payload.validated_data.get("starts_at"),
            ends_at=payload.validated_data.get("ends_at"),
            actor=request.user,
            request=request,
        )
        promo.redemption_count = 0
        return Response(AdminPromoCodeSerializer(promo).data, status=201)


class AdminPromoCodeDetailView(PlatformAPIView):
    """Read or amend one discount code.

    There is no DELETE. `PromoRedemption.promo_code` is `on_delete=PROTECT`, so a code
    that has ever been used cannot be removed anyway — and removing one that has would
    erase the reason an old order was discounted. Retiring a code is `is_active: false`,
    which checkout refuses (`orders.services._check_promo`).
    """

    required_capability = roles.MANAGE_PLATFORM_PRICING

    def _get(self, id):
        return get_object_or_404(
            PromoCode.objects.filter(kind="discount").annotate(
                redemption_count=Count(
                    "redemptions", filter=Q(redemptions__status__in=["reserved", "consumed"])
                )
            ),
            pk=id,
        )

    def get(self, request, id):
        return Response(AdminPromoCodeSerializer(self._get(id)).data)

    def patch(self, request, id):
        promo = self._get(id)
        payload = UpdatePromoCodeSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        promo_services.update_discount_promo_code(
            promo, actor=request.user, request=request, **payload.validated_data
        )
        return Response(AdminPromoCodeSerializer(self._get(id)).data)


# --- Dashboard and reports -----------------------------------------------------------

class DashboardView(PlatformAPIView):
    required_capability = roles.VIEW_PLATFORM_DASHBOARD

    def get(self, request):
        # Margin is the platform's own economics; only a pricing-capable role sees it.
        include_margin = has_platform_capability(request.user, roles.MANAGE_PLATFORM_PRICING)
        return Response(
            report_services.platform_dashboard(
                date_from=request.query_params.get("date_from") or None,
                date_to=request.query_params.get("date_to") or None,
                include_margin=include_margin,
            )
        )


class RevenueReportView(PlatformAPIView):
    required_capability = roles.VIEW_PLATFORM_REPORTS

    def get(self, request):
        return Response({"series": report_services.revenue_timeseries()})


# --- Orders, customers, payments -----------------------------------------------------

class AdminOrderListView(PlatformListView):
    required_capability = roles.VIEW_ORDER
    serializer_class = AdminOrderListSerializer

    def get_queryset(self):
        queryset = Order.objects.select_related("referring_organization").annotate(
            item_count=Count("items")
        )
        params = self.request.query_params
        for field in ("status", "payment_status", "fulfillment_status"):
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        organization = params.get("referring_organization")
        if organization:
            queryset = queryset.filter(referring_organization_id=organization)
        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(order_number__icontains=search) | Q(customer_email__icontains=search)
            )
        if params.get("date_from"):
            queryset = queryset.filter(created_at__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(created_at__lte=params["date_to"])
        return queryset.order_by("-created_at")


class AdminOrderDetailView(PlatformRetrieveView):
    required_capability = roles.VIEW_ORDER
    serializer_class = AdminOrderDetailSerializer
    lookup_field = "id"

    def get_queryset(self):
        return (
            Order.objects.select_related("referring_organization")
            .prefetch_related("items", "payments")
            .annotate(item_count=Count("items", distinct=True))
        )


class AdminCustomerListView(PlatformListView):
    required_capability = roles.VIEW_CUSTOMER
    serializer_class = AdminCustomerSerializer

    def get_queryset(self):
        queryset = User.objects.annotate(order_count=Count("orders"))
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return queryset.order_by("-date_joined")


class AdminCustomerDetailView(PlatformAPIView):
    required_capability = roles.VIEW_CUSTOMER

    def get(self, request, id):
        customer = get_object_or_404(
            User.objects.annotate(order_count=Count("orders")), pk=id
        )
        orders = (
            Order.objects.filter(user=customer)
            .annotate(item_count=Count("items"))
            .order_by("-created_at")
        )
        # Looking up a customer exposes personal data — record who did it.
        record_audit(
            action="customer.viewed", obj=customer,
            context={"customer_email": customer.email}, request=request,
        )
        return Response({
            "customer": AdminCustomerSerializer(customer).data,
            "orders": AdminOrderListSerializer(orders, many=True).data,
        })


class AdminPaymentListView(PlatformListView):
    required_capability = roles.VIEW_ORDER
    serializer_class = AdminPaymentSerializer

    def get_queryset(self):
        queryset = Payment.objects.select_related("order")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")


# --- Refunds -------------------------------------------------------------------------

class AdminRefundListView(PlatformListView):
    required_capability = roles.MANAGE_REFUND
    serializer_class = AdminRefundSerializer

    def get_queryset(self):
        return Refund.objects.select_related("payment__order").order_by("-created_at")


class AdminOrderCancelView(PlatformAPIView):
    """End an order that was placed but never paid.

    The panel could refund a settled order and do nothing at all with an unsettled
    one, so abandoned checkouts had no way to end: 57 of 63 orders on production sat
    in `pending_payment`, the oldest twelve days old, each still holding the promo use
    it reserved at creation.

    The guard lives in `orders.services.cancellation_blocker` and is shared with the
    `cancel_stale_orders` command, so an operator clicking here and an operator
    running the sweep cannot get different answers about whether an order took money.
    """

    required_capability = roles.MANAGE_ORDER

    def post(self, request, id):
        order = get_object_or_404(Order, pk=id)
        released = order_services.cancel_unpaid_order(order)
        record_audit(
            action="order.cancelled",
            obj=order,
            request=request,
            changes={"released_promo_reservations": released},
        )
        order.refresh_from_db()
        return Response(AdminOrderDetailSerializer(order).data)


class AdminOrderRefundView(PlatformAPIView):
    """Execute a refund against an order. Finance/platform admins only."""

    required_capability = roles.MANAGE_REFUND

    def post(self, request, id):
        order = get_object_or_404(Order, pk=id)
        payload = CreateRefundSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        payment = (
            Payment.objects.filter(
                order=order, status__in=["succeeded", "partially_refunded"]
            )
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            raise Conflict(message="This order has no settled payment to refund.")

        refund = payment_services.create_refund(
            payment=payment,
            allocations=[
                {"order_item_id": a["order_item_id"], "amount_minor": a["amount_minor"]}
                for a in payload.validated_data["allocations"]
            ],
            reason=payload.validated_data.get("reason") or None,
        )
        record_audit(
            action="refund.created",
            obj=refund,
            changes={"amount_minor": [None, refund.amount_minor]},
            context={"order_number": order.order_number, "status": refund.status},
            request=request,
        )
        return Response(AdminRefundSerializer(refund).data, status=201)


# --- eSIMs ---------------------------------------------------------------------------

class AdminEsimListView(PlatformListView):
    required_capability = roles.VIEW_ESIM
    serializer_class = AdminEsimListSerializer

    def get_queryset(self):
        queryset = EsimProfile.objects.select_related("order_item", "order_item__order")
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(order_item__order__order_number__icontains=search)
                | Q(iccid_last4=search)
            )
        return queryset.order_by("-created_at")


class AdminEsimDetailView(PlatformRetrieveView):
    required_capability = roles.VIEW_ESIM
    serializer_class = AdminEsimListSerializer
    lookup_field = "id"

    def get_queryset(self):
        return EsimProfile.objects.select_related("order_item", "order_item__order")


class AdminEsimRevealView(PlatformAPIView):
    """Return decrypted activation credentials.

    Gated by its own capability (support may reveal; finance may not), throttled
    separately, and always audited — the audit records *that* a reveal happened, never the
    credentials themselves.
    """

    required_capability = roles.REVEAL_CREDENTIALS
    throttle_scope = "reveal"

    def post(self, request, id):
        profile = get_object_or_404(
            EsimProfile.objects.select_related("order_item__order"), pk=id
        )
        record_audit(
            action="esim.credentials_revealed",
            obj=profile,
            context={
                "order_number": profile.order_item.order.order_number,
                "iccid_last4": profile.iccid_last4,
            },
            request=request,
        )
        return Response({
            "id": str(profile.id),
            "status": profile.status,
            "credentials": esim_services.decrypt_credentials(profile),
        })


class AdminEsimRefreshUsageView(PlatformAPIView):
    required_capability = roles.VIEW_ESIM
    throttle_scope = "usage"

    def post(self, request, id):
        profile = get_object_or_404(EsimProfile, pk=id)
        try:
            esim_services.refresh_usage(profile)
        except SupplierError as exc:
            # The supplier being unhelpful is not OUR crash. As a 500 the panel showed
            # "An unexpected error occurred", which tells an operator nothing and sends
            # them to the server logs for something the provider already explained.
            raise UpstreamUnavailable(message=f"The supplier could not be read: {exc}")
        record_audit(action="esim.usage_refreshed", obj=profile, request=request)
        return Response(AdminEsimListSerializer(profile).data)


class AdminEsimSupplierProbeView(PlatformAPIView):
    """What did the supplier actually send back for this eSIM?

    Exists because the usage refresh has never worked and could not be diagnosed from
    outside the container: the provider answers 200 OK, our parse finds no rows, and the
    panel showed a bare 500. Reading it needed shell access to production, which is a bad
    answer to "a provider changed something" — it will happen again.

    Returns STRUCTURE ONLY — keys, counts, the success flag, their own error text, and
    the five lifecycle fields, which are statuses and byte counts rather than secrets.
    ICCIDs, activation codes and QR payloads never appear, so this cannot be used to walk
    around the audited reveal endpoint.

    Gated on MANAGE_OPS, the same capability as retrying a supplier event — not VIEW_OPS.
    It spends a real supplier API call, so it is an action rather than a read, and a
    read-only role must not be able to run up someone else's rate limit. Audited for the
    same reason: it should be visible that somebody made the call.
    """

    required_capability = roles.MANAGE_OPS
    throttle_scope = "usage"

    def get(self, request, id):
        profile = get_object_or_404(EsimProfile, pk=id)
        if not profile.supplier_reference:
            raise Conflict(
                message="This eSIM has no supplier reference yet, so there is nothing to query."
            )
        gateway = esim_supplier.get_supplier_gateway()
        probe = gateway.probe_usage(supplier_reference=profile.supplier_reference)
        record_audit(action="esim.supplier_probed", obj=profile, request=request)
        return Response({"profile_status": profile.status, "probe": probe})


# --- Operations ----------------------------------------------------------------------

class AdminSupplierEventListView(PlatformListView):
    required_capability = roles.VIEW_OPS
    serializer_class = AdminSupplierEventSerializer

    def get_queryset(self):
        queryset = SupplierEvent.objects.all()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")


class AdminSupplierEventRetryView(PlatformAPIView):
    required_capability = roles.MANAGE_OPS

    def post(self, request, id):
        event = get_object_or_404(SupplierEvent, pk=id)
        event = operation_services.retry_supplier_event(
            event, actor=request.user, request=request
        )
        return Response(AdminSupplierEventSerializer(event).data)


class AdminNotificationListView(PlatformListView):
    required_capability = roles.VIEW_OPS
    serializer_class = AdminNotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.all()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset.order_by("-created_at")


class AdminNotificationRetryView(PlatformAPIView):
    required_capability = roles.MANAGE_OPS

    def post(self, request, id):
        notification = get_object_or_404(Notification, pk=id)
        notification = operation_services.retry_notification(
            notification, actor=request.user, request=request
        )
        return Response(AdminNotificationSerializer(notification).data)


# --- Commissions & payouts -----------------------------------------------------------

class AdminCommissionListView(PlatformListView):
    required_capability = roles.MANAGE_COMMISSION
    serializer_class = AdminCommissionSerializer

    def get_queryset(self):
        queryset = PartnerCommission.objects.select_related("organization", "order")
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("organization"):
            queryset = queryset.filter(organization_id=params["organization"])
        if params.get("date_from"):
            queryset = queryset.filter(created_at__date__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(created_at__date__lte=params["date_to"])
        if params.get("unpaid") == "true":
            queryset = queryset.filter(payout__isnull=True)
        return queryset.order_by("-created_at")


class AdminCommissionApproveView(PlatformAPIView):
    required_capability = roles.MANAGE_COMMISSION

    def post(self, request, id):
        commission = get_object_or_404(
            PartnerCommission.objects.select_related("organization", "order"), pk=id
        )
        commission = account_services.approve_commission(
            commission, actor=request.user, request=request
        )
        return Response(AdminCommissionSerializer(commission).data)


class AdminCommissionBulkApproveView(PlatformAPIView):
    """Approve many at once, reporting per-item failures rather than aborting."""

    required_capability = roles.MANAGE_COMMISSION

    def post(self, request):
        payload = BulkApproveSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        approved, failed = [], []
        for commission_id in payload.validated_data["commission_ids"]:
            commission = PartnerCommission.objects.filter(pk=commission_id).first()
            if commission is None:
                failed.append({"id": str(commission_id), "error": "not found"})
                continue
            try:
                account_services.approve_commission(
                    commission, actor=request.user, request=request
                )
                approved.append(str(commission_id))
            except Conflict as exc:
                failed.append({"id": str(commission_id), "error": exc.message})
        return Response({"approved": approved, "failed": failed})


class AdminPayoutListCreateView(PlatformAPIView):
    required_capability = roles.MANAGE_COMMISSION

    def get(self, request):
        queryset = (
            CommissionPayout.objects.select_related("organization")
            .annotate(commission_count=Count("commissions"))
        )
        if request.query_params.get("organization"):
            queryset = queryset.filter(
                organization_id=request.query_params["organization"]
            )
        if request.query_params.get("status"):
            queryset = queryset.filter(status=request.query_params["status"])
        return Response(
            AdminPayoutSerializer(queryset.order_by("-created_at"), many=True).data
        )

    def post(self, request):
        payload = CreatePayoutSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        organization = get_object_or_404(
            Organization, pk=payload.validated_data["organization"]
        )
        payout = account_services.create_payout(
            organization,
            period_start=payload.validated_data["period_start"],
            period_end=payload.validated_data["period_end"],
            currency=payload.validated_data["currency"],
            actor=request.user,
            request=request,
        )
        return Response(AdminPayoutSerializer(payout).data, status=201)


class AdminPayoutPayView(PlatformAPIView):
    required_capability = roles.MANAGE_COMMISSION

    def post(self, request, id):
        payout = get_object_or_404(
            CommissionPayout.objects.select_related("organization"), pk=id
        )
        payload = MarkPayoutPaidSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        payout = account_services.mark_payout_paid(
            payout,
            actor=request.user,
            reference=payload.validated_data.get("reference") or None,
            method=payload.validated_data.get("method") or None,
            request=request,
        )
        return Response(AdminPayoutSerializer(payout).data)


# --- Catalogue -------------------------------------------------------------------------

class AdminCountryListView(PlatformListView):
    required_capability = roles.MANAGE_CATALOG
    serializer_class = AdminCountrySerializer
    pagination_class = None

    def get_queryset(self):
        queryset = Country.objects.annotate(
            plan_count=Count("plans", distinct=True),
            active_plan_count=Count(
                "plans", filter=Q(plans__status="active"), distinct=True
            ),
        )
        if self.request.query_params.get("search"):
            search = self.request.query_params["search"]
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(iso2__iexact=search)
            )
        return queryset.order_by("sort_order", "name")


class AdminCountryDetailView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    def get(self, request, id):
        country = get_object_or_404(Country, pk=id)
        return Response(AdminCountrySerializer(country).data)

    def patch(self, request, id):
        country = get_object_or_404(Country, pk=id)
        serializer = AdminCountrySerializer(country, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        country = catalogue_services.update_country(
            country, serializer.validated_data, actor=request.user, request=request
        )
        return Response(AdminCountrySerializer(country).data)


class AdminCountryActivatePlansView(PlatformAPIView):
    """Turn on every sellable plan for a country — the usual go-live action."""

    required_capability = roles.MANAGE_CATALOG

    def post(self, request, id):
        country = get_object_or_404(Country, pk=id)
        result = catalogue_services.activate_country_plans(
            country, actor=request.user, request=request
        )
        return Response(result)


class AdminPlanListView(PlatformListView):
    required_capability = roles.MANAGE_CATALOG
    serializer_class = AdminPlanSerializer

    def get_queryset(self):
        queryset = CatalogPlan.objects.select_related("country")
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("country"):
            queryset = queryset.filter(country_id=params["country"])
        if params.get("country_iso2"):
            queryset = queryset.filter(country__iso2=params["country_iso2"].upper())
        if params.get("search"):
            queryset = queryset.filter(
                Q(product_code__icontains=params["search"])
                | Q(display_name__icontains=params["search"])
            )
        return queryset.order_by("country__name", "sort_order")


class AdminPlanDetailView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    def get(self, request, id):
        plan = get_object_or_404(CatalogPlan.objects.select_related("country"), pk=id)
        return Response(AdminPlanSerializer(plan, context={"request": request}).data)

    def patch(self, request, id):
        plan = get_object_or_404(CatalogPlan.objects.select_related("country"), pk=id)
        serializer = AdminPlanSerializer(
            plan, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        if "retail_amount_minor" in serializer.validated_data and not has_platform_capability(
            request.user, roles.MANAGE_PLATFORM_PRICING
        ):
            raise Conflict(
                message="Your role may not change prices.",
                error_code="permission_denied", status_code=403,
            )
        plan = catalogue_services.update_plan(
            plan, serializer.validated_data, actor=request.user, request=request
        )
        return Response(AdminPlanSerializer(plan, context={"request": request}).data)


class AdminPlanStatusView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    #: URL verbs read naturally; the model stores adjectives.
    VERB_TO_STATUS = {"activate": "active", "pause": "paused", "draft": "draft"}

    def post(self, request, id, status):
        plan = get_object_or_404(CatalogPlan.objects.select_related("country"), pk=id)
        plan = catalogue_services.set_plan_status(
            plan, self.VERB_TO_STATUS[status], actor=request.user, request=request
        )
        return Response(AdminPlanSerializer(plan, context={"request": request}).data)


class AdminPlanBulkStatusView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    def post(self, request):
        payload = BulkPlanStatusSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        result = catalogue_services.bulk_set_plan_status(
            payload.validated_data["plan_ids"], payload.validated_data["status"],
            actor=request.user, request=request,
        )
        return Response(result)


class AdminCatalogImportView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    def post(self, request):
        counts = catalogue_services.import_catalogue(actor=request.user, request=request)
        return Response(counts)


class AdminTopupProductListView(PlatformListView):
    required_capability = roles.MANAGE_CATALOG
    serializer_class = AdminTopupProductSerializer

    def get_queryset(self):
        queryset = TopupProduct.objects.all()
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset.order_by("product_code")


class AdminTopupProductDetailView(PlatformAPIView):
    required_capability = roles.MANAGE_CATALOG

    def patch(self, request, id):
        product = get_object_or_404(TopupProduct, pk=id)
        serializer = AdminTopupProductSerializer(
            product, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        product = catalogue_services.update_topup_product(
            product, serializer.validated_data, actor=request.user, request=request
        )
        return Response(
            AdminTopupProductSerializer(product, context={"request": request}).data
        )


# --- Audit trail ---------------------------------------------------------------------

class AuditEventListView(PlatformListView):
    """Read-only. There is deliberately no create/update/delete endpoint."""

    required_capability = roles.VIEW_AUDIT
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        queryset = AuditEvent.objects.all()
        for field in ("action", "actor_type", "object_type"):
            value = self.request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        organization_id = self.request.query_params.get("organization")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset.order_by("-created_at")
