from django.core.cache import cache
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import fx, selectors
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


class FxRateListView(APIView):
    """The rates the storefront must use for both display and charging.

    Display and checkout have to agree, or the price changes between the product page and
    the receipt. Serving one buffered table from one place is what guarantees they match.
    A currency absent from this table cannot be charged in.
    """

    permission_classes = [AllowAny]

    #: Rates change rarely (they are configured by hand), so a per-request read is pure
    #: waste. This cached copy is what storefront renders and ISR revalidations hit.
    CACHE_KEY = "fx:rates:v1"
    CACHE_SECONDS = 900

    def get(self, request):
        payload = cache.get(self.CACHE_KEY)
        if payload is None:
            rates = fx.current_rates()
            payload = {
                "base": fx.BASE,
                "buffer": str(fx.buffer()),
                "rates": {code: str(value) for code, value in sorted(rates.items())},
            }
            cache.set(self.CACHE_KEY, payload, self.CACHE_SECONDS)

        response = Response(payload)
        # Safe for a CDN to hold: the table only changes when someone edits settings, and
        # checkout re-reads the authoritative rate server-side anyway.
        response["Cache-Control"] = f"public, max-age={self.CACHE_SECONDS}, s-maxage={self.CACHE_SECONDS}"
        return response
