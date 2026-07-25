import hashlib

from django.conf import settings

_GB = 1000 * 1000 * 1000


class SupplierError(Exception):
    pass


class SupplierTimeout(SupplierError):
    pass


class SupplierPermanentError(SupplierError):
    pass


class EsimAccessGateway:
    def __init__(self):
        if not settings.ESIM_SUPPLIER_BASE_URL or not settings.ESIM_SUPPLIER_API_KEY:
            raise SupplierError("eSIM supplier is not configured.")
        import httpx

        self._client = httpx.Client(
            base_url=settings.ESIM_SUPPLIER_BASE_URL,
            headers={"Authorization": f"Bearer {settings.ESIM_SUPPLIER_API_KEY}"},
            timeout=settings.ESIM_SUPPLIER_TIMEOUT,
        )

    def provision(self, *, package_code, idempotency_key, order_item=None):
        raise SupplierError(
            "eSIM Access provisioning is unverified — do not enable in production without the "
            "official supplier API contract (spec §21)."
        )

    def get_usage(self, *, supplier_reference):
        raise SupplierError("eSIM Access usage endpoint is unverified (spec §21).")

    def apply_topup(self, *, supplier_reference, package_code, data_amount_mb, idempotency_key):
        raise SupplierError("eSIM Access top-up endpoint is unverified (spec §21).")


class FakeSupplier:
    def provision(self, *, package_code, idempotency_key, order_item=None):
        seed = hashlib.sha256(idempotency_key.encode()).hexdigest()
        iccid = ("8944" + str(int(seed[:16], 16)))[:19]
        token = seed[:10].upper()
        return {
            "supplier_reference": "esimref_" + seed[:16],
            "iccid": iccid,
            "smdp_address": "smdp.fake-esim.example.com",
            "activation_code": token,
            "qr_payload": f"LPA:1$smdp.fake-esim.example.com${token}",
            "total_data_bytes": 10 * _GB,
            "remaining_data_bytes": 10 * _GB,
            "raw": {"provider": "fake", "package": package_code, "ref": seed[:16]},
        }

    def get_usage(self, *, supplier_reference):
        seed = hashlib.sha256(supplier_reference.encode()).hexdigest()
        total = 10 * _GB
        used = int(total * (int(seed[:2], 16) / 255.0))
        return {"total_data_bytes": total, "remaining_data_bytes": total - used}

    def apply_topup(self, *, supplier_reference, package_code, data_amount_mb, idempotency_key):
        seed = hashlib.sha256(idempotency_key.encode()).hexdigest()
        return {"supplier_reference": "topupref_" + seed[:16], "raw": {"provider": "fake", "package": package_code}}


def get_supplier_gateway():
    name = getattr(settings, "SUPPLIER_GATEWAY", "") or (
        "esim_access" if settings.ESIM_SUPPLIER_API_KEY else "fake"
    )
    return EsimAccessGateway() if name == "esim_access" else FakeSupplier()
