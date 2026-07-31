import hashlib
import hmac
import json

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


class PaymentGatewayError(Exception):
    pass


class SignatureVerificationError(PaymentGatewayError):
    pass


class StripeGateway:
    def __init__(self):
        import stripe

        if not settings.STRIPE_SECRET_KEY:
            raise PaymentGatewayError("STRIPE_SECRET_KEY is not configured.")
        stripe.api_key = settings.STRIPE_SECRET_KEY
        self._stripe = stripe

    def create_payment_intent(self, *, amount_minor, currency, metadata, idempotency_key):
        intent = self._stripe.PaymentIntent.create(
            amount=amount_minor,
            currency=currency.lower(),
            metadata=metadata,
            idempotency_key=idempotency_key,
            automatic_payment_methods={"enabled": True},
        )
        return {
            "id": intent.id,
            "client_secret": intent.client_secret,
            "status": intent.status,
        }

    def create_refund(self, *, payment_intent_id, amount_minor, idempotency_key):
        refund = self._stripe.Refund.create(
            payment_intent=payment_intent_id,
            amount=amount_minor,
            idempotency_key=idempotency_key,
        )
        return {"id": refund.id, "status": refund.status}

    def construct_event(self, payload, sig_header):
        """Verify the signature and return the event as a **plain dict**.

        ``Webhook.construct_event`` returns a ``StripeObject``, which overrides
        ``__getattr__`` to resolve keys — so ``event.get(...)`` raises ``AttributeError``
        ("no key named 'get'") rather than behaving like a dict. Downstream code must not
        have to care which provider shape it is holding, so the already-verified raw
        payload is decoded into ordinary dicts here.
        """
        try:
            self._stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except Exception as exc:
            raise SignatureVerificationError(str(exc)) from exc
        body = payload if isinstance(payload, bytes) else payload.encode()
        return json.loads(body)


class FakeGateway:
    def _secret(self):
        return (settings.STRIPE_WEBHOOK_SECRET or "fake-webhook-secret").encode()

    def create_payment_intent(self, *, amount_minor, currency, metadata, idempotency_key):
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:24]
        payment_intent_id = "pi_fake_" + digest
        return {
            "id": payment_intent_id,
            "client_secret": payment_intent_id + "_secret",
            "status": "requires_payment_method",
        }

    def create_refund(self, *, payment_intent_id, amount_minor, idempotency_key):
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:16]
        return {"id": "re_fake_" + digest, "status": "succeeded"}

    def sign(self, payload):
        body = payload if isinstance(payload, bytes) else payload.encode()
        return hmac.new(self._secret(), body, hashlib.sha256).hexdigest()

    def construct_event(self, payload, sig_header):
        body = payload if isinstance(payload, bytes) else payload.encode()
        expected = hmac.new(self._secret(), body, hashlib.sha256).hexdigest()
        if not sig_header or not hmac.compare_digest(expected, sig_header):
            raise SignatureVerificationError("Invalid webhook signature.")
        return json.loads(body)


def get_gateway():
    name = getattr(settings, "PAYMENTS_GATEWAY", "") or (
        "stripe" if settings.STRIPE_SECRET_KEY else "fake"
    )
    if name == "stripe":
        return StripeGateway()
    if name == "fake":
        return FakeGateway()
    raise ImproperlyConfigured(
        f"PAYMENTS_GATEWAY={name!r} is unknown. Refusing to fall back to the fake gateway."
    )
