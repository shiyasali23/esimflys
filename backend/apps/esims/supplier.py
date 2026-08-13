"""eSIM supplier gateways.

Two implementations behind one interface:

* :class:`EsimAccessGateway` — the real eSIM Access API.
* :class:`FakeSupplier` — deterministic stand-in used by the whole test suite and by local
  development, so no test ever spends real money.

Which one runs is decided by ``settings.SUPPLIER_GATEWAY``.

Verified against the live API (2026-07-29)
------------------------------------------
* Base path is ``{host}/api/v1/open`` and every call is ``POST`` with a JSON body.
* Auth is the plain ``RT-AccessCode`` header. HMAC signing (``RT-Signature``) is optional
  and **not** required for this account — a plain call to ``/balance/query`` returned
  ``success: true``. HMAC is implemented anyway and switches on when a secret key is set.
* Envelope is ``{"success": bool, "errorCode": str|int, "errorMsg": str, "obj": {...}}``.
* Money is USD × 10 000 (``18000`` = $1.80); data volumes are bytes.

NOT yet verified (their docs are inconsistent, and there is **no sandbox** — the first real
call spends wallet money). These are marked ``# UNVERIFIED`` below and must be confirmed on
the first live order:

* the exact field names inside the ``/esim/order`` body,
* which key ``/esim/query`` accepts for lookup after a duplicate-transaction recovery.
"""

import hashlib
import hmac
import logging
import time
import uuid

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

_GB = 1000 * 1000 * 1000

#: Their money scale (USD × 10 000) → our minor units (cents).
SUPPLIER_AMOUNT_DIVISOR = 100

# --- Documented error codes ----------------------------------------------------------
ERROR_WRONG_STATE = "200002"
ERROR_INSUFFICIENT_BALANCE = "200007"
ERROR_DUPLICATE_TRANSACTION = "310402"
ERROR_AUTH_FAILED = "401001"


class SupplierError(Exception):
    """Transient failure — the job is retried with the same idempotency key."""


class SupplierTimeout(SupplierError):
    """Unknown outcome. The order may or may not have been placed."""


class SupplierPermanentError(SupplierError):
    """Retrying cannot help — the job goes to manual review."""


class SupplierNotReady(SupplierError):
    """The eSIM is ordered but not provisioned yet; poll again shortly."""


class DuplicateTransaction(SupplierError):
    """The supplier already has this transactionId — recover, never re-order."""


def supplier_amount_to_minor(value):
    """Convert a supplier price (USD × 10 000) to our minor units (cents)."""
    if value is None:
        return None
    return int(value) // SUPPLIER_AMOUNT_DIVISOR


class EsimAccessGateway:
    """Client for the eSIM Access open API."""

    API_PREFIX = "/api/v1/open"

    def __init__(self, client=None):
        if not settings.ESIM_SUPPLIER_BASE_URL or not settings.ESIM_SUPPLIER_API_KEY:
            raise SupplierError("eSIM supplier is not configured.")
        self._access_code = settings.ESIM_SUPPLIER_API_KEY
        self._secret_key = settings.ESIM_SUPPLIER_SECRET_KEY
        self._base = settings.ESIM_SUPPLIER_BASE_URL.rstrip("/") + self.API_PREFIX
        self._client = client
        self._timeout = settings.ESIM_SUPPLIER_TIMEOUT

    # -- transport --------------------------------------------------------------------

    def _headers(self, body):
        headers = {
            "RT-AccessCode": self._access_code,
            "Content-Type": "application/json",
        }
        if self._secret_key:
            # Optional HMAC mode. Signature covers timestamp + requestId + accessCode + body.
            timestamp = str(int(time.time() * 1000))
            request_id = str(uuid.uuid4())
            payload = (timestamp + request_id + self._access_code + body).encode()
            headers.update({
                "RT-Timestamp": timestamp,
                "RT-RequestID": request_id,
                "RT-Signature": hmac.new(
                    self._secret_key.encode(), payload, hashlib.sha256
                ).hexdigest(),
            })
        return headers

    def _post(self, path, payload=None):
        """POST and unwrap the response envelope, mapping error codes to exceptions."""
        import json as _json

        import httpx

        body = _json.dumps(payload or {})
        client = self._client or httpx.Client(timeout=self._timeout)
        try:
            response = client.post(
                self._base + path, content=body, headers=self._headers(body)
            )
        except Exception as exc:  # network failure / read timeout
            # An unknown outcome: the order may still have been created upstream, so this
            # must be retried with the *same* transactionId rather than treated as failed.
            raise SupplierTimeout(f"{path}: {type(exc).__name__}: {exc}") from exc
        finally:
            if self._client is None:
                client.close()

        if response.status_code >= 500:
            raise SupplierTimeout(f"{path}: upstream {response.status_code}")
        try:
            data = response.json()
        except ValueError as exc:
            raise SupplierError(f"{path}: non-JSON response") from exc

        if data.get("success"):
            return data.get("obj") or {}

        code = str(data.get("errorCode") or "")
        message = data.get("errorMsg") or "supplier error"
        if code == ERROR_DUPLICATE_TRANSACTION:
            raise DuplicateTransaction(f"{code}: {message}")
        if code in (ERROR_AUTH_FAILED, ERROR_WRONG_STATE):
            raise SupplierPermanentError(f"{code}: {message}")
        if code == ERROR_INSUFFICIENT_BALANCE:
            # Retryable: someone can top the wallet up. Backoff eventually parks it in
            # manual review, which is the correct place for "we ran out of money".
            raise SupplierError(f"{code}: insufficient supplier balance — top up the wallet")
        raise SupplierError(f"{code}: {message}")

    # -- read-only ---------------------------------------------------------------------

    def query_balance(self):
        """Wallet balance in our minor units. Verified working."""
        obj = self._post("/balance/query")
        raw = obj.get("balance")
        return {
            "balance_minor": supplier_amount_to_minor(raw),
            "raw_balance": raw,
        }

    def list_packages(self, *, location_code=None, package_code=None, iccid=None, type_=None):
        """Catalogue + wholesale prices. Used for margin/price-drift checks, never pricing."""
        payload = {}
        if location_code:
            payload["locationCode"] = location_code
        if package_code:
            payload["packageCode"] = package_code
        if iccid:
            payload["iccid"] = iccid
        if type_:
            payload["type"] = type_
        obj = self._post("/package/list", payload)
        return obj.get("packageList") or obj.get("list") or []

    # -- provisioning (two-phase) -------------------------------------------------------

    def order_esim(self, *, package_code, transaction_id, count=1, period_num=None):
        """Phase 1 — place the order. Returns ``{"order_no": ...}``.

        ``transaction_id`` is our idempotency key. Re-sending it raises
        :class:`DuplicateTransaction`, which the caller treats as "already ordered" and
        recovers from rather than ordering again.
        """
        package = {"packageCode": package_code, "count": count}
        if period_num:
            package["periodNum"] = period_num  # day count for daily plans
        # UNVERIFIED: their docs are inconsistent about an `amount`/`price` field here.
        # Confirm on the first live order and add it if the API rejects this body.
        obj = self._post(
            "/esim/order",
            {"transactionId": transaction_id, "packageInfoList": [package]},
        )
        order_no = obj.get("orderNo") or obj.get("orderNumber")
        if not order_no:
            raise SupplierError("order response contained no orderNo")
        return {"order_no": order_no, "raw": obj}

    def query_esim(self, *, order_no=None, transaction_id=None, esim_tran_no=None):
        """Phase 2 — fetch the provisioned profile.

        Ready 3–10 s after ordering, so a not-yet-ready answer raises
        :class:`SupplierNotReady` and the job is re-polled rather than failed.
        """
        payload = {}
        if order_no:
            payload["orderNo"] = order_no
        if transaction_id:
            payload["transactionId"] = transaction_id  # UNVERIFIED lookup key
        if esim_tran_no:
            payload["esimTranNoList"] = [esim_tran_no]
        obj = self._post("/esim/query", payload)

        profiles = obj.get("esimList") or obj.get("list") or []
        if not profiles:
            raise SupplierNotReady("no profile returned yet")
        profile = profiles[0]

        iccid = profile.get("iccid")
        if not iccid:
            raise SupplierNotReady("profile not provisioned yet (no iccid)")

        # eSIM Access returns ONE field, `ac`, holding the whole LPA activation string:
        #   LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11
        # There is no separate SM-DP+ or QR-payload field, so both are derived from it.
        # Reading `smdpAddress` (as an earlier version did) silently produced NULL on every
        # real order, which the fake supplier hid because it returns those keys itself.
        activation = profile.get("ac")
        smdp_address, qr_payload = _split_activation(activation)

        return {
            "supplier_reference": profile.get("esimTranNo"),
            "iccid": iccid,
            "activation_code": activation,
            "qr_payload": qr_payload,
            "qr_code_url": profile.get("qrCodeUrl"),
            "short_url": profile.get("shortUrl"),
            "smdp_address": smdp_address,
            "total_data_bytes": profile.get("totalVolume"),
            "remaining_data_bytes": _remaining(profile),
            "expires_at": profile.get("expiredTime"),
            "esim_status": profile.get("esimStatus"),
            "smdp_status": profile.get("smdpStatus"),
            "raw": _redact_supplier_payload(profile),
        }

    # -- lifecycle ----------------------------------------------------------------------

    def get_usage(self, *, supplier_reference):
        """Data used vs remaining. Their figures lag 1–3 hours — never present as live."""
        obj = self._post("/esim/usage/query", {"esimTranNoList": [supplier_reference]})
        rows = obj.get("esimList") or obj.get("list") or []
        if not rows:
            raise SupplierError("usage query returned no rows")
        row = rows[0]
        return {
            "total_data_bytes": row.get("totalVolume"),
            "remaining_data_bytes": _remaining(row),
        }

    def apply_topup(self, *, supplier_reference, package_code, data_amount_mb=None,
                    idempotency_key=None):
        """Recharge an existing eSIM. Only packages with ``supportTopUpType == 2``."""
        payload = {"esimTranNo": supplier_reference, "packageCode": package_code}
        if idempotency_key:
            payload["transactionId"] = idempotency_key
        obj = self._post("/esim/topup", payload)
        return {"supplier_reference": obj.get("orderNo") or supplier_reference,
                "raw": _redact_supplier_payload(obj)}

    def cancel_esim(self, *, supplier_reference):
        """Cancel an **unused** eSIM. This is the supplier-side refund: the wallet is
        credited automatically. Fails with 200002 once the eSIM has been used."""
        obj = self._post("/esim/cancel", {"esimTranNo": supplier_reference})
        return {"raw": _redact_supplier_payload(obj)}

    # Kept for interface parity with FakeSupplier; provisioning now uses order/query.
    def provision(self, *, package_code, idempotency_key, order_item=None):
        raise SupplierError(
            "Use order_esim()/query_esim(); eSIM Access provisioning is two-phase."
        )


def _split_activation(activation):
    """Split an LPA activation string into ``(smdp_address, qr_payload)``.

    The format is ``LPA:1$<smdp-address>$<matching-id>``. The whole string is what a phone
    scans, so it *is* the QR payload; the SM-DP+ address is the middle segment and is only
    needed for manual entry, where a customer types the two parts separately.

    Anything that is not a well-formed LPA string yields ``(None, None)`` rather than a
    half-parsed value: a wrong SM-DP+ address sends the phone to the wrong server, which is
    worse than showing nothing and falling back to the hosted QR image.
    """
    if not activation or not activation.startswith("LPA:"):
        return None, None
    parts = activation.split("$")
    if len(parts) < 3 or not parts[1]:
        return None, None
    return parts[1], activation


def _remaining(row):
    total, used = row.get("totalVolume"), row.get("orderUsage")
    if total is None:
        return None
    if used is None:
        return total
    return max(int(total) - int(used), 0)


def _redact_supplier_payload(payload):
    """Keep only non-secret fields — activation data must never be persisted raw."""
    if not isinstance(payload, dict):
        return {}
    keep = ("esimTranNo", "orderNo", "packageCode", "esimStatus", "smdpStatus",
            "totalVolume", "orderUsage", "expiredTime")
    return {k: payload[k] for k in keep if k in payload}


#: Excludes 0-9 and a-f entirely, so a generated code can never appear inside a hash, a
#: UUID or any other hex identifier. Also drops I/O/S to avoid look-alike confusion.
_ACTIVATION_ALPHABET = "GHJKLMNPQRTUVWXYZ"


def _fake_activation_code(seed, length=12):
    digest = hashlib.sha256(("activation:" + seed).encode()).digest()
    return "".join(_ACTIVATION_ALPHABET[b % len(_ACTIVATION_ALPHABET)] for b in digest[:length])


class FakeSupplier:
    """Deterministic stand-in. Mirrors the real gateway's two-phase interface."""

    def query_balance(self):
        return {"balance_minor": 5000_00, "raw_balance": 5000_0000}

    def list_packages(self, **kwargs):
        return []

    def order_esim(self, *, package_code, transaction_id, count=1, period_num=None):
        seed = hashlib.sha256(transaction_id.encode()).hexdigest()
        return {"order_no": "ord_" + seed[:16], "raw": {"provider": "fake"}}

    def query_esim(self, *, order_no=None, transaction_id=None, esim_tran_no=None):
        seed = hashlib.sha256((order_no or transaction_id or esim_tran_no or "x").encode()).hexdigest()
        iccid = ("8944" + str(int(seed[:16], 16)))[:19]
        # Deliberately NOT hex, and derived from a separate hash.
        #
        # This used to be `seed[:10].upper()`, while supplier_reference is
        # "esimref_" + seed[:16]. About 1% of seeds open with ten hex characters that
        # contain no letters, so .upper() was a no-op and the "secret" became a literal
        # substring of a non-secret field the audit legitimately keeps. Credential-leak
        # tests scan for exactly that and failed at random — the long-standing flake.
        #
        # Using an alphabet outside [0-9a-f] means a fake activation code can never be a
        # substring of a hash, a UUID or any other hex identifier, so the whole class of
        # false positive is gone rather than merely made less likely. It also matches real
        # LPA codes, which are alphanumeric rather than hex.
        token = _fake_activation_code(seed)
        return {
            "supplier_reference": "esimref_" + seed[:16],
            "iccid": iccid,
            "activation_code": token,
            # All three delivery forms, so tests exercise every credential path.
            "qr_payload": f"LPA:1$smdp.fake-esim.example.com${token}",
            "qr_code_url": f"https://fake-esim.example.com/qr/{seed[:12]}.png",
            "short_url": f"https://fake-esim.example.com/i/{seed[:8]}",
            "smdp_address": "smdp.fake-esim.example.com",
            "total_data_bytes": 10 * _GB,
            "remaining_data_bytes": 10 * _GB,
            "expires_at": None,
            "esim_status": "GOT_RESOURCE",
            "smdp_status": "RELEASED",
            "raw": {"provider": "fake", "packageCode": "FAKE"},
        }

    # Legacy single-call interface, still used by older tests.
    def provision(self, *, package_code, idempotency_key, order_item=None):
        result = self.query_esim(transaction_id=idempotency_key)
        token = result["activation_code"]
        result["qr_payload"] = f"LPA:1$smdp.fake-esim.example.com${token}"
        result["raw"] = {"provider": "fake", "package": package_code}
        return result

    def get_usage(self, *, supplier_reference):
        seed = hashlib.sha256(supplier_reference.encode()).hexdigest()
        total = 10 * _GB
        used = int(total * (int(seed[:2], 16) / 255.0))
        return {"total_data_bytes": total, "remaining_data_bytes": total - used}

    def apply_topup(self, *, supplier_reference, package_code, data_amount_mb=None,
                    idempotency_key=None):
        seed = hashlib.sha256((idempotency_key or supplier_reference).encode()).hexdigest()
        return {"supplier_reference": "topupref_" + seed[:16],
                "raw": {"provider": "fake", "package": package_code}}

    def cancel_esim(self, *, supplier_reference):
        return {"raw": {"provider": "fake", "cancelled": supplier_reference}}


def get_supplier_gateway():
    name = getattr(settings, "SUPPLIER_GATEWAY", "") or "fake"
    if name == "esim_access":
        return EsimAccessGateway()
    if name == "fake":
        return FakeSupplier()
    raise ImproperlyConfigured(
        f"SUPPLIER_GATEWAY={name!r} is unknown. Refusing to fall back to the fake supplier, "
        "which would mark paid orders fulfilled with unusable credentials."
    )
