from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from apps.common.health import live, ready


def blocked_account_route(request, *args, **kwargs):
    """allauth is mounted for Google OAuth only.

    Its bundled HTML signup / password-reset / password-change / email-management views are
    a second, unaudited way in: they bypass the DRF serializers that own account rules, and
    in particular the rule that agency credentials are platform-issued and cannot be
    self-managed. Shadowing the paths (rather than trimming the include) keeps every URL
    name allauth reverses internally resolvable, so the OAuth flow is untouched.
    """
    return JsonResponse(
        {
            "error": {
                "code": "not_found",
                "message": "This route is not available. Use the /api/v1/auth/ endpoints.",
                "fields": {},
            }
        },
        status=404,
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/live/", live, name="health-live"),
    path("health/ready/", ready, name="health-ready"),
    path("api/v1/catalog/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.orders.urls")),
    path("api/v1/", include("apps.payments.urls")),
    path("api/v1/", include("apps.esims.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/admin/", include("apps.administration.admin_api.urls")),
    path("api/v1/agency/", include("apps.administration.agency_api.urls")),
    re_path(r"^accounts/(signup|password|email)/", blocked_account_route),
    path("accounts/", include("allauth.urls")),
]


def server_error(request, *args, **kwargs):
    return JsonResponse(
        {"error": {"code": "internal_error", "message": "An unexpected error occurred."}},
        status=500,
    )


handler500 = "config.urls.server_error"
