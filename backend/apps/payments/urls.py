from django.urls import path

from .views import PaymentIntentView, StripeWebhookView

app_name = "payments"

urlpatterns = [
    path("payments/payment-intent/", PaymentIntentView.as_view(), name="payment-intent"),
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
