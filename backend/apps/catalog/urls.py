from django.urls import path

from .views import CountryDetailView, CountryListView, CountryPlansView, PlanDetailView

app_name = "catalog"

urlpatterns = [
    path("countries/", CountryListView.as_view(), name="country-list"),
    path("countries/<slug:slug>/", CountryDetailView.as_view(), name="country-detail"),
    path("countries/<slug:slug>/plans/", CountryPlansView.as_view(), name="country-plans"),
    path("plans/<str:product_code>/", PlanDetailView.as_view(), name="plan-detail"),
]
