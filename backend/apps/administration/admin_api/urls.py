from django.urls import path, re_path

from .views import (
    AdminCatalogImportView,
    AdminCommissionApproveView,
    AdminCommissionBulkApproveView,
    AdminCommissionListView,
    AdminCountryActivatePlansView,
    AdminCountryDetailView,
    AdminCountryListView,
    AdminPayoutListCreateView,
    AdminPayoutPayView,
    AdminPlanBulkStatusView,
    AdminPlanDetailView,
    AdminPlanListView,
    AdminPlanStatusView,
    AdminTopupProductDetailView,
    AdminTopupProductListView,
    AdminCustomerDetailView,
    AdminCustomerListView,
    AdminEsimDetailView,
    AdminEsimListView,
    AdminEsimRefreshUsageView,
    AdminEsimRevealView,
    AdminNotificationListView,
    AdminNotificationRetryView,
    AdminOrderDetailView,
    AdminOrderListView,
    AdminOrderRefundView,
    AdminPaymentListView,
    AdminRefundListView,
    AdminSupplierEventListView,
    AdminSupplierEventRetryView,
    AuditEventListView,
    DashboardView,
    OrganizationDetailView,
    OrganizationListCreateView,
    OrganizationMemberDetailView,
    OrganizationMemberListView,
    OrganizationMemberPasswordView,
    OrganizationTransitionView,
    RevenueReportView,
    TrackingCodeListView,
)

app_name = "admin_api"

# The transition route is constrained to the known action verbs on purpose. A permissive
# `<str:action>` would also match "members" and "tracking-codes" and swallow those routes.
_ACTIONS = "approve|suspend|activate|reject|close"
_UUID = "[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}"

urlpatterns = [
    path("organizations/", OrganizationListCreateView.as_view(), name="organization-list"),
    path("organizations/<uuid:id>/", OrganizationDetailView.as_view(), name="organization-detail"),
    path(
        "organizations/<uuid:id>/members/",
        OrganizationMemberListView.as_view(),
        name="organization-members",
    ),
    path(
        "organizations/<uuid:id>/members/<uuid:member_id>/",
        OrganizationMemberDetailView.as_view(),
        name="organization-member-detail",
    ),
    path(
        "organizations/<uuid:id>/members/<uuid:member_id>/set-password/",
        OrganizationMemberPasswordView.as_view(),
        name="organization-member-set-password",
    ),
    path(
        "organizations/<uuid:id>/tracking-codes/",
        TrackingCodeListView.as_view(),
        name="organization-tracking-codes",
    ),
    re_path(
        rf"^organizations/(?P<id>{_UUID})/(?P<action>{_ACTIONS})/$",
        OrganizationTransitionView.as_view(),
        name="organization-transition",
    ),
    path("audit-events/", AuditEventListView.as_view(), name="audit-events"),

    # Dashboard & reports
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("reports/revenue/", RevenueReportView.as_view(), name="report-revenue"),

    # Orders, customers, payments, refunds
    path("orders/", AdminOrderListView.as_view(), name="order-list"),
    path("orders/<uuid:id>/", AdminOrderDetailView.as_view(), name="order-detail"),
    path("orders/<uuid:id>/refunds/", AdminOrderRefundView.as_view(), name="order-refund"),
    path("customers/", AdminCustomerListView.as_view(), name="customer-list"),
    path("customers/<uuid:id>/", AdminCustomerDetailView.as_view(), name="customer-detail"),
    path("payments/", AdminPaymentListView.as_view(), name="payment-list"),
    path("refunds/", AdminRefundListView.as_view(), name="refund-list"),

    # eSIMs
    path("esims/", AdminEsimListView.as_view(), name="esim-list"),
    path("esims/<uuid:id>/", AdminEsimDetailView.as_view(), name="esim-detail"),
    path("esims/<uuid:id>/reveal/", AdminEsimRevealView.as_view(), name="esim-reveal"),
    path(
        "esims/<uuid:id>/refresh-usage/",
        AdminEsimRefreshUsageView.as_view(),
        name="esim-refresh-usage",
    ),

    # Operations
    path(
        "supplier-events/", AdminSupplierEventListView.as_view(), name="supplier-event-list"
    ),
    path(
        "supplier-events/<uuid:id>/retry/",
        AdminSupplierEventRetryView.as_view(),
        name="supplier-event-retry",
    ),
    # Commissions & payouts
    path("commissions/", AdminCommissionListView.as_view(), name="commission-list"),
    path(
        "commissions/bulk-approve/",
        AdminCommissionBulkApproveView.as_view(),
        name="commission-bulk-approve",
    ),
    path(
        "commissions/<uuid:id>/approve/",
        AdminCommissionApproveView.as_view(),
        name="commission-approve",
    ),
    path("payouts/", AdminPayoutListCreateView.as_view(), name="payout-list"),
    path("payouts/<uuid:id>/pay/", AdminPayoutPayView.as_view(), name="payout-pay"),

    # Catalogue
    path("countries/", AdminCountryListView.as_view(), name="country-list"),
    path("countries/<uuid:id>/", AdminCountryDetailView.as_view(), name="country-detail"),
    path(
        "countries/<uuid:id>/activate-plans/",
        AdminCountryActivatePlansView.as_view(),
        name="country-activate-plans",
    ),
    path("plans/", AdminPlanListView.as_view(), name="plan-list"),
    path("plans/bulk-status/", AdminPlanBulkStatusView.as_view(), name="plan-bulk-status"),
    path("plans/<uuid:id>/", AdminPlanDetailView.as_view(), name="plan-detail"),
    re_path(
        rf"^plans/(?P<id>{_UUID})/(?P<status>activate|pause|draft)/$",
        AdminPlanStatusView.as_view(),
        name="plan-status",
    ),
    path("catalog/import/", AdminCatalogImportView.as_view(), name="catalog-import"),
    path("topup-products/", AdminTopupProductListView.as_view(), name="topup-product-list"),
    path(
        "topup-products/<uuid:id>/",
        AdminTopupProductDetailView.as_view(),
        name="topup-product-detail",
    ),

    path("notifications/", AdminNotificationListView.as_view(), name="notification-list"),
    path(
        "notifications/<uuid:id>/retry/",
        AdminNotificationRetryView.as_view(),
        name="notification-retry",
    ),
]
