from django.urls import path

from .views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    OrganizationCommissionsView,
    OrganizationDetailView,
    OrganizationListView,
    OrganizationPayoutsView,
    PasswordResetConfirmView,
    PasswordResetView,
    RegisterView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/csrf/", CsrfView.as_view(), name="csrf"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/password-reset/", PasswordResetView.as_view(), name="password-reset"),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("account/me/", MeView.as_view(), name="me"),
    path("organizations/", OrganizationListView.as_view(), name="organization-list"),
    path("organizations/<uuid:id>/", OrganizationDetailView.as_view(), name="organization-detail"),
    path(
        "organizations/<uuid:id>/commissions/",
        OrganizationCommissionsView.as_view(),
        name="organization-commissions",
    ),
    path(
        "organizations/<uuid:id>/payouts/",
        OrganizationPayoutsView.as_view(),
        name="organization-payouts",
    ),
]
