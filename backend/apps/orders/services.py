import hashlib
import secrets
import uuid

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import CatalogPlan
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


def add_item(cart, *, product_code, quantity):
    quantity = _validate_quantity(quantity)
    plan = _active_plan_or_error(product_code)
    item = cart.items.filter(catalog_plan=plan).first()
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


def checkout(*, cart_id, customer_email, promo_code=None, user=None):
    with transaction.atomic():
        cart = Cart.objects.select_for_update().filter(pk=cart_id, status="active").first()
        if cart is None:
            raise Conflict(message="There is no active cart to check out.")
        if cart.expires_at and cart.expires_at < timezone.now():
            raise CartExpired()

        items = list(cart.items.all())
        if not items:
            raise Conflict(message="The cart is empty.")

        currency = cart.currency
        snapshots, subtotal = _price_cart(items, currency)

        discount, promo, referring_org = 0, None, None
        if promo_code:
            promo = _reserve_promo(promo_code, subtotal, currency, customer_email, user)
            discount = _discount_for(promo, subtotal)
            referring_org = promo.organization

        tax = _calculate_tax(subtotal, discount, currency)
        total = subtotal - discount + tax

        order = Order.objects.create(
            order_number=_order_number(),
            user=user if (user and user.is_authenticated) else None,
            referring_organization=referring_org,
            promo_code=promo,
            promo_code_snapshot=(promo.code if promo else None),
            customer_email=customer_email,
            currency=currency,
            subtotal_minor=subtotal,
            discount_minor=discount,
            tax_minor=tax,
            total_minor=total,
            status="pending_payment",
            payment_status="pending",
            fulfillment_status="pending",
            placed_at=timezone.now(),
        )
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
        cart.status = "converted"
        cart.save(update_fields=["status", "updated_at"])
        return order


def consume_promo_for_order(order):
    PromoRedemption.objects.filter(order=order, status="reserved").update(
        status="consumed", consumed_at=timezone.now()
    )


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


def _calculate_tax(subtotal, discount, currency):
    return 0


def _order_number():
    return "ESF-" + uuid.uuid4().hex[:12].upper()
