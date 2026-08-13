from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.audit import record_audit
from apps.common.exceptions import Conflict
from apps.esims.models import EsimProfile
from apps.esims.services import decrypt_credentials

from . import services
from .models import Cart, Order
from .serializers import (
    AddItemSerializer,
    DirectCheckoutSerializer,
    CartSerializer,
    CheckoutSerializer,
    OrderLookupSerializer,
    OrderSerializer,
    PromoInputSerializer,
    UpdateItemSerializer,
)

CART_TOKEN_HEADER = "X-Cart-Token"


def _user(request):
    return request.user if request.user.is_authenticated else None


def _cart_token(request):
    return request.headers.get(CART_TOKEN_HEADER)


def _with_items(cart):
    return Cart.objects.prefetch_related("items__catalog_plan").get(pk=cart.pk)


def _require_active_cart(request):
    cart = services.get_active_cart(user=_user(request), guest_token=_cart_token(request))
    if cart is None:
        raise Conflict(message="No active cart.", error_code="not_found", status_code=404)
    return cart


class CartView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        cart = services.get_active_cart(user=_user(request), guest_token=_cart_token(request))
        if cart is None:
            return Response(
                {
                    "id": None,
                    "currency": "USD",
                    "status": "active",
                    "items": [],
                    "subtotal_minor": 0,
                    "item_count": 0,
                }
            )
        return Response(CartSerializer(_with_items(cart)).data)


class CartItemsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        payload = AddItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = _user(request)
        cart = services.get_active_cart(user=user, guest_token=_cart_token(request))
        new_token = None
        if cart is None:
            cart, new_token = services.create_cart(user=user)
        services.add_item(
            cart,
            product_code=payload.validated_data["product_code"],
            quantity=payload.validated_data["quantity"],
        )
        response = Response(CartSerializer(_with_items(cart)).data, status=201)
        if new_token:
            response[CART_TOKEN_HEADER] = new_token
        return response


class CartItemDetailView(APIView):
    permission_classes = [AllowAny]

    def patch(self, request, item_id):
        cart = _require_active_cart(request)
        payload = UpdateItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.set_item_quantity(
            cart, item_id=item_id, quantity=payload.validated_data["quantity"]
        )
        return Response(CartSerializer(_with_items(cart)).data)

    def delete(self, request, item_id):
        cart = _require_active_cart(request)
        services.remove_item(cart, item_id=item_id)
        return Response(CartSerializer(_with_items(cart)).data)


class CartPromoView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "promo"

    def post(self, request):
        cart = _require_active_cart(request)
        payload = PromoInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = _user(request)
        email = payload.validated_data.get("customer_email") or (user.email if user else "")
        preview = services.preview_promo(
            cart, code=payload.validated_data["code"], customer_email=email
        )
        return Response(preview)

    def delete(self, request):
        return Response(status=204)


class CheckoutView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "checkout"

    def post(self, request):
        user = _user(request)
        cart = services.get_active_cart(user=user, guest_token=_cart_token(request))
        if cart is None:
            raise Conflict(message="There is no active cart to check out.")
        payload = CheckoutSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        email = payload.validated_data.get("customer_email") or (user.email if user else None)
        if not email:
            raise ValidationError({"customer_email": ["This field is required for guest checkout."]})
        order = services.checkout(
            cart_id=cart.id,
            customer_email=email,
            promo_code=(payload.validated_data.get("promo_code") or None),
            user=user,
        )
        return Response(OrderSerializer(order).data, status=201)


class OrderListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return (
            Order.objects.filter(user=self.request.user)
            .prefetch_related("items")
            .order_by("-created_at")
        )


class OrderDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    lookup_field = "id"

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items")


class OrderLookupView(APIView):
    """Guest retrieval of an order and its eSIM activation credentials.

    This endpoint returns decrypted secrets to an unauthenticated caller who presents an
    order number plus the matching email, so it is throttled (``lookup`` scope) and every
    call — successful or not — is written to the audit trail.
    """

    permission_classes = [AllowAny]
    throttle_scope = "lookup"

    def post(self, request):
        payload = OrderLookupSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order_number = payload.validated_data["order_number"]
        email = payload.validated_data["email"]

        order = (
            Order.objects.filter(order_number=order_number, customer_email=email)
            .prefetch_related("items")
            .first()
        )
        if order is None:
            record_audit(
                action="order.lookup_failed",
                actor_type="customer",
                request=request,
                context={"order_number": order_number},
            )
            raise Conflict(
                message="No matching order was found.", error_code="not_found", status_code=404
            )

        profiles = list(
            EsimProfile.objects.filter(order_item__order=order).select_related("order_item")
        )
        record_audit(
            action="order.credentials_viewed",
            obj=order,
            actor=order.user,
            actor_type="customer",
            request=request,
            context={"order_number": order.order_number, "esim_count": len(profiles)},
        )
        esims = [
            {
                "status": profile.status,
                "product_name": profile.order_item.product_name,
                "iccid_last4": profile.iccid_last4,
                "credentials": decrypt_credentials(profile),
            }
            for profile in profiles
        ]
        return Response({"order": OrderSerializer(order).data, "esims": esims})


class DirectCheckoutView(APIView):
    """Buy in one request, with no cart.

    The cart exists to hold items between page views. Nothing about creating an order
    needed it: pricing, promo reservation and currency resolution all work from the
    payload, and `Order` has never had a foreign key to `Cart`.

    Double submits are handled by an `Idempotency-Key` header rather than by consuming a
    cart. That is the better guard — a retry after a lost response returns the original
    order instead of a 409, so the customer still has an order number to quote.
    """

    permission_classes = [AllowAny]
    throttle_scope = "checkout"

    def post(self, request):
        payload = DirectCheckoutSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = _user(request)

        email = payload.validated_data.get("customer_email") or (user.email if user else None)
        if not email:
            raise ValidationError(
                {"customer_email": ["This field is required for guest checkout."]}
            )

        order = services.checkout_direct(
            items=payload.validated_data["items"],
            customer_email=email,
            customer_first_name=payload.validated_data.get("customer_first_name", ""),
            customer_last_name=payload.validated_data.get("customer_last_name", ""),
            customer_phone=payload.validated_data.get("customer_phone", ""),
            currency=(payload.validated_data.get("currency") or "USD").upper(),
            promo_code=(payload.validated_data.get("promo_code") or None),
            user=user,
            idempotency_key=request.headers.get("Idempotency-Key") or None,
        )
        return Response(OrderSerializer(order).data, status=201)
