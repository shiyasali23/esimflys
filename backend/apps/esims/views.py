from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import TopupProduct
from apps.orders.serializers import OrderSerializer

from . import services
from .models import EsimProfile, TopupFulfillment
from .permissions import IsEsimOwner
from .serializers import (
    EsimProfileDetailSerializer,
    EsimProfileSerializer,
    TopupCreateSerializer,
    TopupFulfillmentSerializer,
    TopupProductSerializer,
)


def _owned_profiles(user):
    return EsimProfile.objects.filter(
        order_item__order__user=user
    ).select_related("order_item", "order_item__order")


class EsimListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EsimProfileSerializer

    def get_queryset(self):
        return _owned_profiles(self.request.user).order_by("-created_at")


class EsimDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated, IsEsimOwner]
    serializer_class = EsimProfileDetailSerializer
    lookup_field = "id"

    def get_queryset(self):
        return _owned_profiles(self.request.user)


class EsimRefreshUsageView(APIView):
    permission_classes = [IsAuthenticated, IsEsimOwner]
    throttle_scope = "usage"

    def post(self, request, id):
        profile = get_object_or_404(_owned_profiles(request.user), pk=id)
        self.check_object_permissions(request, profile)
        services.refresh_usage(profile)
        return Response(EsimProfileDetailSerializer(profile).data)


class EsimTopupsView(APIView):
    permission_classes = [IsAuthenticated, IsEsimOwner]

    def get(self, request, id):
        profile = get_object_or_404(_owned_profiles(request.user), pk=id)
        self.check_object_permissions(request, profile)
        available = TopupProduct.objects.filter(
            status="active", supplier=profile.supplier
        ).order_by("retail_amount_minor")
        history = TopupFulfillment.objects.filter(esim_profile=profile).order_by(
            "-created_at"
        )
        return Response(
            {
                "available": TopupProductSerializer(available, many=True).data,
                "history": TopupFulfillmentSerializer(history, many=True).data,
            }
        )

    def post(self, request, id):
        profile = get_object_or_404(_owned_profiles(request.user), pk=id)
        self.check_object_permissions(request, profile)
        payload = TopupCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.create_topup_order(
            user=request.user,
            esim_profile_id=profile.id,
            topup_product_code=payload.validated_data["topup_product_code"],
        )
        return Response(OrderSerializer(order).data, status=201)
