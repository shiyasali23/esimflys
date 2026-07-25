from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from apps.common.health import live, ready

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/live/", live, name="health-live"),
    path("health/ready/", ready, name="health-ready"),
    path("api/v1/catalog/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.orders.urls")),
    path("api/v1/", include("apps.payments.urls")),
    path("api/v1/", include("apps.esims.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("accounts/", include("allauth.urls")),
]


def server_error(request, *args, **kwargs):
    return JsonResponse(
        {"error": {"code": "internal_error", "message": "An unexpected error occurred."}},
        status=500,
    )


handler500 = "config.urls.server_error"
