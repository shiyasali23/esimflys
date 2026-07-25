import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.catalog.models import TopupProduct
from apps.common import encryption
from apps.common.exceptions import Conflict, TopupNotSupported
from apps.orders.models import Order, OrderItem
from apps.orders.notifications import queue_notification

from . import supplier as supplier_module
from .models import EsimProfile, SupplierEvent, TopupFulfillment

MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 30


def enqueue_provisioning_for_order(order):
    for item in order.items.filter(item_type="esim"):
        profile, _ = EsimProfile.objects.get_or_create(
            order_item=item, defaults={"supplier": item.supplier, "status": "pending"}
        )
        SupplierEvent.objects.get_or_create(
            idempotency_key=f"provision:{item.id}",
            defaults={
                "supplier": item.supplier,
                "order_item": item,
                "esim_profile": profile,
                "event_type": "provision",
                "correlation_id": uuid.uuid4(),
                "status": "pending",
            },
        )
    for item in order.items.filter(item_type="topup"):
        fulfillment = TopupFulfillment.objects.filter(order_item=item).first()
        if fulfillment is None:
            continue
        SupplierEvent.objects.get_or_create(
            idempotency_key=f"topup:{fulfillment.id}",
            defaults={
                "supplier": item.supplier,
                "order_item": item,
                "esim_profile": fulfillment.esim_profile,
                "event_type": "topup",
                "correlation_id": uuid.uuid4(),
                "status": "pending",
            },
        )


def create_topup_order(*, user, esim_profile_id, topup_product_code):
    with transaction.atomic():
        profile = (
            EsimProfile.objects.select_related("order_item", "order_item__order")
            .filter(pk=esim_profile_id)
            .first()
        )
        if profile is None or profile.order_item.order.user_id != getattr(user, "id", None):
            raise Conflict(message="eSIM not found.", error_code="not_found", status_code=404)
        product = TopupProduct.objects.filter(
            product_code=topup_product_code, status="active"
        ).first()
        if product is None:
            raise TopupNotSupported()
        if product.supplier_id != profile.supplier_id:
            raise TopupNotSupported(message="This top-up is not compatible with this eSIM.")

        source = profile.order_item
        order = Order.objects.create(
            order_number="ESF-" + uuid.uuid4().hex[:12].upper(),
            user=user,
            customer_email=user.email,
            currency=product.currency,
            subtotal_minor=product.retail_amount_minor,
            discount_minor=0,
            tax_minor=0,
            total_minor=product.retail_amount_minor,
            status="pending_payment",
            payment_status="pending",
            fulfillment_status="pending",
            placed_at=timezone.now(),
        )
        order_item = OrderItem.objects.create(
            order=order,
            topup_product=product,
            supplier=product.supplier,
            item_type="topup",
            product_code=product.product_code,
            supplier_package_code=product.supplier_package_code,
            product_name=product.name,
            country_iso2=source.country_iso2,
            country_name=source.country_name,
            plan_type=None,
            data_limit_mb=product.data_amount_mb,
            daily_high_speed_mb=None,
            validity_days=product.validity_days,
            traffic_policy=None,
            network_names=[],
            unit_amount_minor=product.retail_amount_minor,
            wholesale_amount_minor=product.wholesale_amount_minor,
            currency=product.currency,
            status="pending",
        )
        TopupFulfillment.objects.create(
            order_item=order_item, esim_profile=profile, topup_product=product, status="pending"
        )
        return order


def claim_and_process_one():
    now = timezone.now()
    with transaction.atomic():
        event = (
            SupplierEvent.objects.select_for_update(skip_locked=True)
            .filter(status__in=["pending", "retrying"])
            .filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now))
            .order_by("created_at")
            .first()
        )
        if event is None:
            return False
        event.status = "processing"
        event.locked_at = now
        event.attempt_count += 1
        event.save(update_fields=["status", "locked_at", "attempt_count", "updated_at"])

    _process(event)
    return True


def _process(event):
    try:
        if event.event_type == "provision":
            _process_provision(event)
        elif event.event_type == "topup":
            _process_topup(event)
        else:
            _fail(event, "unsupported_event", f"Unsupported event type {event.event_type}")
    except supplier_module.SupplierTimeout as exc:
        _retry_or_review(event, "supplier_timeout", str(exc))
    except supplier_module.SupplierPermanentError as exc:
        _fail(event, "supplier_permanent", str(exc))
    except supplier_module.SupplierError as exc:
        _retry_or_review(event, "supplier_error", str(exc))


def _process_provision(event):
    gateway = supplier_module.get_supplier_gateway()
    item = event.order_item
    result = gateway.provision(
        package_code=item.supplier_package_code,
        idempotency_key=event.idempotency_key,
        order_item=item,
    )
    iccid = result["iccid"]
    iccid_ct, key_version = encryption.encrypt(iccid)
    smdp_ct, _ = encryption.encrypt(result["smdp_address"])
    activation_ct, _ = encryption.encrypt(result["activation_code"])
    qr_ct, _ = encryption.encrypt(result["qr_payload"])
    redacted = _redact(result)

    with transaction.atomic():
        profile = EsimProfile.objects.select_for_update().get(pk=event.esim_profile_id)
        profile.supplier_reference = result["supplier_reference"]
        profile.iccid_encrypted = iccid_ct
        profile.iccid_hash = encryption.iccid_blind_index(iccid)
        profile.iccid_last4 = iccid[-4:]
        profile.smdp_address_encrypted = smdp_ct
        profile.activation_code_encrypted = activation_ct
        profile.qr_payload_encrypted = qr_ct
        profile.encryption_key_version = key_version
        profile.total_data_bytes = result.get("total_data_bytes")
        profile.remaining_data_bytes = result.get("remaining_data_bytes")
        profile.status = "ready"
        profile.supplier_payload_redacted = redacted
        profile.save()

        item.status = "delivered"
        item.save(update_fields=["status", "updated_at"])

        event.status = "succeeded"
        event.supplier_reference = result["supplier_reference"]
        event.response_data_redacted = redacted
        event.completed_at = timezone.now()
        event.error_code = None
        event.error_message = None
        event.save(
            update_fields=[
                "status", "supplier_reference", "response_data_redacted",
                "completed_at", "error_code", "error_message", "updated_at",
            ]
        )
        _refresh_order_fulfillment(item.order_id)
        queue_notification(
            template_code="esim-ready",
            recipient=item.order.customer_email,
            idempotency_key=f"notify:esim-ready:{profile.id}",
            user=item.order.user,
            order=item.order,
            esim_profile=profile,
        )


def _process_topup(event):
    gateway = supplier_module.get_supplier_gateway()
    fulfillment = TopupFulfillment.objects.select_related("topup_product", "order_item").get(
        order_item_id=event.order_item_id
    )
    profile = EsimProfile.objects.get(pk=event.esim_profile_id)
    result = gateway.apply_topup(
        supplier_reference=profile.supplier_reference,
        package_code=fulfillment.topup_product.supplier_package_code,
        data_amount_mb=fulfillment.topup_product.data_amount_mb,
        idempotency_key=event.idempotency_key,
    )
    added_bytes = fulfillment.topup_product.data_amount_mb * 1_000_000

    with transaction.atomic():
        profile = EsimProfile.objects.select_for_update().get(pk=event.esim_profile_id)
        profile.total_data_bytes = (profile.total_data_bytes or 0) + added_bytes
        profile.remaining_data_bytes = (profile.remaining_data_bytes or 0) + added_bytes
        profile.save(
            update_fields=["total_data_bytes", "remaining_data_bytes", "updated_at"]
        )

        fulfillment.status = "completed"
        fulfillment.supplier_reference = result.get("supplier_reference")
        fulfillment.completed_at = timezone.now()
        fulfillment.save(
            update_fields=["status", "supplier_reference", "completed_at", "updated_at"]
        )

        item = fulfillment.order_item
        item.status = "delivered"
        item.save(update_fields=["status", "updated_at"])

        event.status = "succeeded"
        event.supplier_reference = result.get("supplier_reference")
        event.response_data_redacted = {"provider": (result.get("raw") or {}).get("provider")}
        event.completed_at = timezone.now()
        event.error_code = None
        event.error_message = None
        event.save(
            update_fields=[
                "status", "supplier_reference", "response_data_redacted",
                "completed_at", "error_code", "error_message", "updated_at",
            ]
        )
        _refresh_order_fulfillment(item.order_id)
        queue_notification(
            template_code="topup-confirmation",
            recipient=item.order.customer_email,
            idempotency_key=f"notify:topup-confirmation:{fulfillment.id}",
            user=item.order.user,
            order=item.order,
            esim_profile=profile,
        )


def _retry_or_review(event, code, message):
    with transaction.atomic():
        event = SupplierEvent.objects.select_for_update().get(pk=event.pk)
        event.error_code = code
        event.error_message = message
        if event.attempt_count >= MAX_ATTEMPTS:
            event.status = "manual_review"
        else:
            event.status = "retrying"
            delay = BACKOFF_BASE_SECONDS * (2 ** (event.attempt_count - 1))
            event.next_attempt_at = timezone.now() + timedelta(seconds=delay)
        event.save(
            update_fields=[
                "status", "error_code", "error_message", "next_attempt_at", "updated_at"
            ]
        )


def _fail(event, code, message):
    with transaction.atomic():
        event = SupplierEvent.objects.select_for_update().get(pk=event.pk)
        event.status = "manual_review"
        event.error_code = code
        event.error_message = message
        event.save(update_fields=["status", "error_code", "error_message", "updated_at"])


def _refresh_order_fulfillment(order_id):
    order = Order.objects.select_for_update().get(pk=order_id)
    items = list(order.items.all())
    delivered = sum(1 for item in items if item.status == "delivered")
    if delivered == 0:
        return
    if delivered == len(items):
        order.fulfillment_status = "delivered"
        order.status = "fulfilled"
    else:
        order.fulfillment_status = "partially_delivered"
        order.status = "partially_fulfilled"
    order.save(update_fields=["fulfillment_status", "status", "updated_at"])


def refresh_usage(profile):
    if not profile.supplier_reference:
        return profile
    usage = supplier_module.get_supplier_gateway().get_usage(
        supplier_reference=profile.supplier_reference
    )
    profile.total_data_bytes = usage.get("total_data_bytes", profile.total_data_bytes)
    profile.remaining_data_bytes = usage.get(
        "remaining_data_bytes", profile.remaining_data_bytes
    )
    profile.last_synced_at = timezone.now()
    profile.save(
        update_fields=[
            "total_data_bytes", "remaining_data_bytes", "last_synced_at", "updated_at"
        ]
    )
    return profile


def decrypt_credentials(profile):
    version = profile.encryption_key_version
    if version is None:
        return None
    return {
        "iccid": _decrypt(profile.iccid_encrypted, version),
        "smdp_address": _decrypt(profile.smdp_address_encrypted, version),
        "activation_code": _decrypt(profile.activation_code_encrypted, version),
        "qr_payload": _decrypt(profile.qr_payload_encrypted, version),
    }


def _decrypt(value, version):
    return encryption.decrypt(bytes(value), version) if value else None


def _redact(result):
    raw = result.get("raw") or {}
    return {
        "supplier_reference": result.get("supplier_reference"),
        "provider": raw.get("provider"),
        "package": raw.get("package"),
    }
