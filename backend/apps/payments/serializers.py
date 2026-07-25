from rest_framework import serializers


class PaymentIntentInputSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
