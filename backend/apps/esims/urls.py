from django.urls import path

from .views import (
    EsimDetailView,
    EsimListView,
    EsimRefreshUsageView,
    EsimTopupsView,
)

app_name = "esims"

urlpatterns = [
    path("esims/", EsimListView.as_view(), name="esim-list"),
    path("esims/<uuid:id>/", EsimDetailView.as_view(), name="esim-detail"),
    path("esims/<uuid:id>/refresh-usage/", EsimRefreshUsageView.as_view(), name="esim-refresh-usage"),
    path("esims/<uuid:id>/topups/", EsimTopupsView.as_view(), name="esim-topups"),
]
