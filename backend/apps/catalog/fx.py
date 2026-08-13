"""FX rates.

Rates are configured by hand in ``settings.FX_RATES``, not fetched from a provider.

That is a deliberate trade. Gross margin across the catalogue is a median 67% — the Turkey
plan is $6.99 retail against $0.46 wholesale — so ordinary currency drift cannot turn a sale
into a loss, and a daily feed with staleness handling would be infrastructure managing a risk
that does not exist. A conservative fixed rate plus the buffer covers it.

The exception: a few expensive plans sit near 20% margin, where a ~20% drift *would* bite.
Review the configured rates every month or two rather than never.

``FxRate`` rows remain supported and take precedence when present, so switching to an
automated feed later needs no change here.
"""

from decimal import Decimal

from django.conf import settings

from .models import FxRate

BASE = "USD"


def buffer():
    """Margin protection applied on top of the configured rate."""
    return Decimal(str(getattr(settings, "FX_BUFFER", "1.03")))


def configured_rates():
    """{code: Decimal} from settings. The normal source."""
    return {
        code.upper(): Decimal(str(value))
        for code, value in (getattr(settings, "FX_RATES", {}) or {}).items()
        if value and Decimal(str(value)) > 0
    }


def latest_rate(currency):
    """The rate to price ``currency`` with, or None if it cannot be charged in.

    A stored ``FxRate`` wins over settings, so an automated feed can be introduced later
    without touching callers. Absent both, the currency is simply not offered.
    """
    currency = currency.upper()
    if currency == BASE:
        return Decimal(1)

    row = (
        FxRate.objects.filter(base_currency=BASE, quote_currency=currency)
        .order_by("-fetched_at")
        .first()
    )
    if row:
        return row.rate
    return configured_rates().get(currency)


def is_supported_for_charging(currency):
    return latest_rate(currency) is not None


def current_rates():
    """Every currency that may be charged in, USD included.

    Resolved through ``latest_rate`` — the same function that prices an order — so a
    currency can never be QUOTED at one rate and CHARGED at another.

    This is not hypothetical. This function used to let settings win while
    ``latest_rate`` let a stored row win, and with INR configured at 88 and a row at
    83.20 the storefront quoted ₹1,359 for a plan that billed at ₹1,289. Anything that
    reads a rate for display must come through here, and here goes through there.
    """
    codes = {BASE, *configured_rates()}
    codes.update(
        FxRate.objects.filter(base_currency=BASE)
        .values_list("quote_currency", flat=True)
        .distinct()
    )
    resolved = ((code, latest_rate(code)) for code in codes)
    return {code: rate for code, rate in resolved if rate is not None}
