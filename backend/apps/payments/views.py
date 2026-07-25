from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import Conflict
from apps.orders.models import Order

from . import services
from .serializers import PaymentIntentInputSerializer


class PaymentIntentView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "payment"

    def post(self, request):
        payload = PaymentIntentInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = Order.objects.filter(pk=payload.validated_data["order_id"]).first()
        if order is None:
            raise Conflict(message="Order not found.", error_code="not_found", status_code=404)
        if order.user_id is not None:
            if not request.user.is_authenticated or request.user.id != order.user_id:
                raise PermissionDenied()
        return Response(services.create_payment_intent_for_order(order))


class StripeWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        result = services.handle_webhook_event(
            request.body, request.headers.get("Stripe-Signature")
        )
        return Response({"received": result["ok"]}, status=result["status"])
