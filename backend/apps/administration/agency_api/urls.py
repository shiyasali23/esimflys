from django.urls import path

from .views import (
    AgencyActivityView,
    AgencyCommissionListView,
    AgencyDashboardView,
    AgencyMemberListView,
    AgencyPayoutListView,
    AgencyProfileView,
    AgencyRevenueReportView,
    AgencySalesView,
    AgencyTrackingCodeListView,
)

app_name = "agency_api"

# Tenant-scoped: `organization_id` is resolved by IsAgencyMember on every request.
urlpatterns = [
    path("<uuid:organization_id>/dashboard/", AgencyDashboardView.as_view(), name="dashboard"),
    path("<uuid:organization_id>/profile/", AgencyProfileView.as_view(), name="profile"),
    path("<uuid:organization_id>/members/", AgencyMemberListView.as_view(), name="members"),
    path("<uuid:organization_id>/sales/", AgencySalesView.as_view(), name="sales"),
    path(
        "<uuid:organization_id>/commissions/",
        AgencyCommissionListView.as_view(),
        name="commissions",
    ),
    path("<uuid:organization_id>/payouts/", AgencyPayoutListView.as_view(), name="payouts"),
    path(
        "<uuid:organization_id>/tracking-codes/",
        AgencyTrackingCodeListView.as_view(),
        name="tracking-codes",
    ),
    path(
        "<uuid:organization_id>/reports/revenue/",
        AgencyRevenueReportView.as_view(),
        name="report-revenue",
    ),
    path("<uuid:organization_id>/activity/", AgencyActivityView.as_view(), name="activity"),
]
