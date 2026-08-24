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

    def retrieve_payment_intent(self, payment_intent_id):
        """Ask Stripe what actually happened to an intent.

        The reconciler needs this because a webhook is best-effort: if the delivery is
        lost, rejected or delayed, nothing else in the system ever learns the payment
        succeeded. Shaped to match the `data.object` of a `payment_intent.succeeded`
        event so `_handle_succeeded` can consume either source unchanged — including
        `amount`, `currency` and `metadata`, which it reconciles against the order before
        marking anything paid.
        """
        # `latest_charge` is expanded because a REFUND DOES NOT CHANGE `status`: a
        # refunded intent still reads "succeeded" for ever. Without this, reconciling a
        # charge that was already refunded — by hand, in the dashboard, before the webhook
        # was ever fixed — would provision an eSIM and give the goods away. The two orders
        # stranded by the webhook outage are exactly that shape.
        intent = self._stripe.PaymentIntent.retrieve(
            payment_intent_id, expand=["latest_charge"]
        )
        # ATTRIBUTE access, not `.get()`. A stripe-python resource is not a dict —
        # `intent.get(...)` raises "'get' is a dict method, but a PaymentIntent is not a
        # dict". [MEASURED] in production: every reconciliation pass logged that and
        # recovered nothing. No test could catch it, because `FakeGateway` returns the
        # plain dict this method PRODUCES, so the fake never exercised the mapping that
        # consumes the real object. `test_maps_a_real_stripe_resource` does.
        #
        # `latest_charge` is a bare id string when the expand is dropped or unsupported,
        # and None before any charge exists — neither carries refund state, so both fall
        # back to "not refunded" and the intent is treated on its own terms.
        charge = getattr(intent, "latest_charge", None)
        if charge is None or isinstance(charge, str):
            amount_refunded, refunded = 0, False
        else:
            amount_refunded = getattr(charge, "amount_refunded", 0) or 0
            refunded = bool(getattr(charge, "refunded", False))
        return {
            "id": intent.id,
            "status": intent.status,
            "amount": intent.amount,
            "currency": intent.currency,
            "metadata": dict(intent.metadata or {}),
            "amount_refunded": amount_refunded,
            "refunded": refunded,
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

    #: What `retrieve_payment_intent` should answer, keyed by intent id. Tests set this
    #: to describe the world Stripe is presenting; anything not listed is still
    #: `requires_payment_method`, i.e. genuinely unpaid, which must NOT be reconciled.
    retrievable = {}

    def retrieve_payment_intent(self, payment_intent_id):
        return self.retrievable.get(
            payment_intent_id,
            {
                "id": payment_intent_id,
                "status": "requires_payment_method",
                "amount": 0,
                "currency": "usd",
                "metadata": {},
            },
        )

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
