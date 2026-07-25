from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny

from . import selectors
from .models import Country
from .serializers import CountrySerializer, PlanDetailSerializer, PlanSerializer


class CountryListView(ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = CountrySerializer
    pagination_class = None

    def get_queryset(self):
        return selectors.active_countries()


class CountryDetailView(RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = CountrySerializer
    lookup_field = "slug"

    def get_queryset(self):
        return selectors.active_countries()


class CountryPlansView(ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PlanSerializer
    pagination_class = None

    def get_queryset(self):
        get_object_or_404(Country, slug=self.kwargs["slug"], is_active=True)
        return selectors.active_plans(country_slug=self.kwargs["slug"])


class PlanDetailView(RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PlanDetailSerializer
    lookup_field = "product_code"

    def get_queryset(self):
        return selectors.active_plans()
