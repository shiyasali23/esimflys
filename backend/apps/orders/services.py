from collections import namedtuple
from decimal import Decimal
import hashlib
import secrets
import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog import fx
from apps.catalog.models import CatalogPlan
from apps.common import currency as currency_utils
from apps.common.currency import BASE_CURRENCY
from apps.common.exceptions import (
    CartExpired,
    Conflict,
    InvalidQuantity,
    PlanUnavailable,
    PromoExpired,
    PromoInvalid,
    PromoUsageExceeded,
)

from .models import Cart, CartItem, Order, OrderItem, PromoCode, PromoRedemption

GUEST_TOKEN_BYTES = 32
MAX_QUANTITY = 1000
#: Cap on total eSIMs per cart/order. One unit becomes one OrderItem and one supplier job.
MAX_CART_UNITS = 50


def guest_token_hash(token):
    return hashlib.sha256(token.encode()).digest()


def email_hash(email):
    return hashlib.sha256(email.strip().lower().encode()).digest()


def new_guest_token():
    return secrets.token_urlsafe(GUEST_TOKEN_BYTES)


def get_active_cart(*, user=None, guest_token=None, currency="USD"):
    if user is not None and user.is_authenticated:
        return Cart.objects.filter(user=user, status="active", currency=currency).first()
    if guest_token:
        return Cart.objects.filter(
            guest_token_hash=guest_token_hash(guest_token), status="active"
        ).first()
    return None


def create_cart(*, user=None, currency="USD"):
    if user is not None and user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(
            user=user, status="active", currency=currency
        )
        return cart, None
    token = new_guest_token()
    cart = Cart.objects.create(
        guest_token_hash=guest_token_hash(token), currency=currency, status="active"
    )
    return cart, token


def _assert_cart_units(cart, *, added_units, replacing_item_id=None):
    """Bound the whole cart, not just one line.

    Checkout expands every unit into its own OrderItem row and later into one supplier job,
    so the per-line cap alone still permits a single request to create an unbounded amount
    of work. Throttles limit how many requests arrive, never how much each one costs.
    """
    current = sum(
        item.quantity
        for item in cart.items.all()
        if replacing_item_id is None or item.id != replacing_item_id
    )
    if current + added_units > MAX_CART_UNITS:
        raise Conflict(
            message=f"A cart may hold at most {MAX_CART_UNITS} eSIMs.",
            error_code="cart_limit_exceeded",
        )


def add_item(cart, *, product_code, quantity):
    quantity = _validate_quantity(quantity)
    plan = _active_plan_or_error(product_code)
    item = cart.items.filter(catalog_plan=plan).first()
    _assert_cart_units(cart, added_units=quantity)
    if item is None:
        return CartItem.objects.create(
            cart=cart, item_type="esim", catalog_plan=plan, quantity=quantity
        )
    item.quantity = min(item.quantity + quantity, MAX_QUANTITY)
    item.save(update_fields=["quantity", "updated_at"])
    return item


def set_item_quantity(cart, *, item_id, quantity):
    quantity = _validate_quantity(quantity)
    item = cart.items.filter(pk=item_id).first()
    if item is None:
        raise Conflict(message="Cart item not found.", error_code="not_found", status_code=404)
    _assert_cart_units(cart, added_units=quantity, replacing_item_id=item.id)
    item.quantity = quantity
    item.save(update_fields=["quantity", "updated_at"])
    return item


def remove_item(cart, *, item_id):
    cart.items.filter(pk=item_id).delete()


def preview_promo(cart, *, code, customer_email):
    _snapshots, subtotal = _price_cart(list(cart.items.all()), cart.currency)
    promo = _validate_promo(code, subtotal, cart.currency, customer_email, None)
    discount = _discount_for(promo, subtotal)
    return {
        "code": promo.code,
        "discount_minor": discount,
        "subtotal_minor": subtotal,
        "total_minor": subtotal - discount,
        "currency": cart.currency,
    }


#: What ``create_order`` needs from a line. A CartItem satisfies it, and so does a plain
#: request payload — which is the whole point: order creation never needed a Cart row.
OrderLine = namedtuple("OrderLine", ["catalog_plan_id", "quantity"])


def create_order(
    *, lines, customer_email, requested_currency=BASE_CURRENCY, promo_code=None, user=None,
    customer_first_name="", customer_last_name="", customer_phone="",
):
    """Price a set of lines and write the order. The single source of truth.

    Deliberately knows nothing about carts. Every rule that actually protects money lives
    here — server-side repricing, promo reservation, currency resolution, the base-amount
    snapshot — and none of it ever depended on a Cart row. ``lines`` only has to expose
    ``catalog_plan_id`` and ``quantity``.

    The caller owns the transaction: a cart checkout also has to close its cart in the same
    atomic block, and the direct path has an idempotency row to write.
    """
    lines = list(lines)
    if not lines:
        raise Conflict(message="There is nothing to check out.")

    units = sum(line.quantity for line in lines)
    if units > MAX_CART_UNITS:
        raise Conflict(
            message=f"An order may contain at most {MAX_CART_UNITS} eSIMs.",
            error_code="cart_limit_exceeded",
        )

    # Plans are priced in USD, so an order is always costed in USD first. That figure is
    # what commissions and reports read; the charge currency is derived from it.
    snapshots, base_subtotal = _price_cart(lines, BASE_CURRENCY)

    base_discount, promo, referring_org = 0, None, None
    if promo_code:
        promo = _reserve_promo(
            promo_code, base_subtotal, BASE_CURRENCY, customer_email, user
        )
        base_discount = _discount_for(promo, base_subtotal)
        referring_org = promo.organization

    currency, rate = _resolve_charge_currency(
        requested_currency, base_subtotal - base_discount
    )

    subtotal = currency_utils.convert(base_subtotal, to_currency=currency, rate=rate)
    # Capped at the subtotal: the subtotal is charm-rounded down to a clean price while a
    # discount is not, so an uncapped full-value discount lands just above it and trips
    # the order_discount_le_subtotal database constraint.
    discount = currency_utils.convert_discount(
        base_discount, to_currency=currency, rate=rate, max_minor=subtotal
    )

    # No tax is charged. The column stays on the order so the stored total always
    # balances against subtotal and discount, and so historical orders keep a truthful
    # record if a tax policy is ever adopted.
    tax = 0
    total = subtotal - discount + tax

    order = Order.objects.create(
        order_number=_order_number(),
        user=user if (user and user.is_authenticated) else None,
        referring_organization=referring_org,
        promo_code=promo,
        promo_code_snapshot=(promo.code if promo else None),
        customer_email=customer_email,
        customer_first_name=customer_first_name or "",
        customer_last_name=customer_last_name or "",
        customer_phone=customer_phone or "",
        currency=currency,
        subtotal_minor=subtotal,
        discount_minor=discount,
        tax_minor=tax,
        total_minor=total,
        base_currency=BASE_CURRENCY,
        base_subtotal_minor=base_subtotal,
        base_total_minor=base_subtotal - base_discount,
        # Snapshotted, never re-derived: a refund weeks later must reverse the amount
        # that was actually taken, at the rate it was actually taken at.
        fx_rate_used=rate,
        status="pending_payment",
        payment_status="pending",
        fulfillment_status="pending",
        placed_at=timezone.now(),
    )
    for snap in snapshots:
        snap["base_unit_amount_minor"] = snap["unit_amount_minor"]
        snap["unit_amount_minor"] = currency_utils.convert(
            snap["base_unit_amount_minor"], to_currency=currency, rate=rate
        )
        snap["currency"] = currency
    OrderItem.objects.bulk_create([OrderItem(order=order, **snap) for snap in snapshots])
    if promo:
        PromoRedemption.objects.create(
            promo_code=promo,
            order=order,
            user=user if (user and user.is_authenticated) else None,
            customer_email_hash=email_hash(customer_email),
            status="reserved",
            reserved_at=timezone.now(),
        )
    return order


def checkout_direct(
    *, items, customer_email, currency=BASE_CURRENCY, promo_code=None, user=None,
    idempotency_key=None, customer_first_name="", customer_last_name="", customer_phone="",
):
    """Create an order from a request payload, with no cart.

    ``items`` is ``[{"product_code": str, "quantity": int}]``. Prices are read from the
    catalogue server-side exactly as the cart path does — a client cannot influence them.

    ``idempotency_key`` is what makes a lost response survivable. Returning the original
    order on a retry is strictly better than the cart's guard, which converted the cart and
    then answered 409, leaving the customer with nothing to quote at support.
    """
    if idempotency_key:
        existing = Order.objects.filter(idempotency_key=idempotency_key).first()
        if existing is not None:
            return existing

    lines = []
    for entry in items:
        plan = _active_plan_or_error(entry["product_code"])
        quantity = _validate_quantity(entry.get("quantity", 1))
        lines.append(OrderLine(catalog_plan_id=plan.id, quantity=quantity))

    try:
        with transaction.atomic():
            order = create_order(
                lines=lines,
                customer_email=customer_email,
                requested_currency=currency,
                promo_code=promo_code,
                user=user,
                customer_first_name=customer_first_name,
                customer_last_name=customer_last_name,
                customer_phone=customer_phone,
            )
            if idempotency_key:
                order.idempotency_key = idempotency_key
                order.save(update_fields=["idempotency_key", "updated_at"])
            return order
    except IntegrityError:
        # Two concurrent requests carrying the same key: the unique constraint lets exactly
        # one through and the loser reads the winner's order. The whole transaction rolls
        # back, so the loser leaves no half-written order or promo reservation behind.
        if idempotency_key:
            winner = Order.objects.filter(idempotency_key=idempotency_key).first()
            if winner is not None:
                return winner
        raise


def checkout(*, cart_id, customer_email, promo_code=None, user=None):
    """Convert a cart into an order.

    Retained so the existing storefront keeps working unchanged. All it adds over
    :func:`create_order` is the cart lifecycle: lock the row, refuse an expired or empty
    cart, and mark it converted — which is also the double-submit guard.
    """
    with transaction.atomic():
        cart = Cart.objects.select_for_update().filter(pk=cart_id, status="active").first()
        if cart is None:
            raise Conflict(message="There is no active cart to check out.")
        if cart.expires_at and cart.expires_at < timezone.now():
            raise CartExpired()

        items = list(cart.items.all())
        if not items:
            raise Conflict(message="The cart is empty.")

        order = create_order(
            lines=items,
            customer_email=customer_email,
            requested_currency=cart.currency,
            promo_code=promo_code,
            user=user,
        )
        cart.status = "converted"
        cart.save(update_fields=["status", "updated_at"])
        return order


def consume_promo_for_order(order):
    # A PaymentIntent may report a failed attempt and later succeed with another card, which
    # releases the reservation before the order is paid. The order still carries the discount,
    # so a released redemption must consume too or the code escapes its usage limits.
    PromoRedemption.objects.filter(
        order=order, status__in=["reserved", "released"]
    ).update(status="consumed", consumed_at=timezone.now())


def release_promo_for_order(order):
    PromoRedemption.objects.filter(order=order, status="reserved").update(
        status="released", released_at=timezone.now()
    )


def _validate_quantity(quantity):
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        raise InvalidQuantity()
    if quantity < 1 or quantity > MAX_QUANTITY:
        raise InvalidQuantity()
    return quantity


def _active_plan_or_error(product_code):
    plan = (
        CatalogPlan.objects.select_related("country", "supplier")
        .filter(product_code=product_code)
        .first()
    )
    if plan is None or plan.status != "active" or not plan.country.is_active:
        raise PlanUnavailable()
    return plan


#: Smallest charge each currency will accept, in minor units. Stripe rejects anything that
#: converts to under about 30p — measured against the live account, INR is refused at ₹35
#: and accepted at ₹40. A little headroom is left on top.
MIN_CHARGE_MINOR = {"INR": 5000}


def _resolve_charge_currency(requested, base_amount_after_discount):
    """Pick the currency to charge in, falling back to USD rather than failing.

    Two reasons to fall back. The currency may have no configured rate, in which case it
    simply cannot be priced. Or the converted total may land under the provider's minimum —
    which Stripe reports as a raw error at the payment step, long after the customer has
    committed. Quietly charging in USD is a far better outcome than a dead checkout.
    """
    requested = (requested or BASE_CURRENCY).upper()
    if requested == BASE_CURRENCY:
        return BASE_CURRENCY, Decimal(1)

    rate = fx.latest_rate(requested)
    if rate is None or not currency_utils.is_supported(requested):
        return BASE_CURRENCY, Decimal(1)

    minimum = MIN_CHARGE_MINOR.get(requested)
    if minimum is not None:
        converted = currency_utils.convert(
            base_amount_after_discount, to_currency=requested, rate=rate
        )
        if converted < minimum:
            return BASE_CURRENCY, Decimal(1)

    return requested, rate


def _price_cart(items, currency):
    snapshots, subtotal = [], 0
    for item in items:
        plan = (
            CatalogPlan.objects.select_related("country", "supplier")
            .filter(pk=item.catalog_plan_id)
            .first()
        )
        if plan is None or plan.status != "active" or not plan.country.is_active:
            raise PlanUnavailable()
        unit = plan.retail_amount_minor
        for _ in range(item.quantity):
            snapshots.append(_snapshot(plan, unit))
            subtotal += unit
    return snapshots, subtotal


def _snapshot(plan, unit_amount_minor):
    return {
        "catalog_plan": plan,
        "supplier": plan.supplier,
        "item_type": "esim",
        "product_code": plan.product_code,
        "supplier_package_code": plan.supplier_package_code,
        "product_name": plan.display_name,
        "country_iso2": plan.country.iso2,
        "country_name": plan.country.name,
        "plan_type": plan.plan_type,
        "data_limit_mb": plan.data_limit_mb,
        "daily_high_speed_mb": plan.daily_high_speed_mb,
        "validity_days": plan.validity_days,
        "traffic_policy": plan.traffic_policy,
        "network_names": plan.network_names,
        "unit_amount_minor": unit_amount_minor,
        "wholesale_amount_minor": plan.wholesale_amount_minor,
        "currency": plan.currency,
        "status": "pending",
    }


def _reserve_promo(code, subtotal, currency, customer_email, user):
    promo = PromoCode.objects.select_for_update().filter(code=code).first()
    return _check_promo(promo, subtotal, currency, customer_email)


def _validate_promo(code, subtotal, currency, customer_email, user):
    promo = PromoCode.objects.filter(code=code).first()
    return _check_promo(promo, subtotal, currency, customer_email)


def _check_promo(promo, subtotal, currency, customer_email):
    now = timezone.now()
    if promo is None or not promo.is_active:
        raise PromoInvalid()
    if promo.starts_at and promo.starts_at > now:
        raise PromoInvalid(message="This promo code is not active yet.")
    if promo.ends_at and promo.ends_at < now:
        raise PromoExpired()
    if promo.discount_type == "fixed" and promo.discount_currency != currency:
        raise PromoInvalid(message="This promo code does not apply to this currency.")
    if subtotal < promo.minimum_order_minor:
        raise PromoInvalid(message="This order does not meet the minimum for this promo code.")
    counted = PromoRedemption.objects.filter(
        promo_code=promo, status__in=["reserved", "consumed"]
    )
    if promo.usage_limit is not None and counted.count() >= promo.usage_limit:
        raise PromoUsageExceeded()
    if promo.per_customer_limit is not None:
        used = counted.filter(customer_email_hash=email_hash(customer_email)).count()
        if used >= promo.per_customer_limit:
            raise PromoUsageExceeded()
    return promo


def _discount_for(promo, subtotal):
    if promo.discount_type == "percentage_bps":
        discount = subtotal * promo.discount_value // 10000
        if promo.maximum_discount_minor is not None:
            discount = min(discount, promo.maximum_discount_minor)
    else:
        discount = promo.discount_value
    return min(discount, subtotal)


def _order_number():
    return "ESF-" + uuid.uuid4().hex[:12].upper()
