"""Currency arithmetic.

Every conversion between a human amount and the integer minor units the database stores
goes through here. Nothing anywhere else may multiply or divide by 100.

The reason is JPY. Yen has no minor unit: ¥700 is stored as ``700``, not ``70000``. A single
hard-coded ``* 100`` on that path charges a customer one hundred times the intended price, and
the bug is invisible in every other currency. The decimal count therefore lives in one table
and every caller reads it from here.
"""

from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal

from apps.common.exceptions import DomainError


class UnsupportedCurrency(DomainError):
    status_code = 422
    error_code = "unsupported_currency"
    default_message = "That currency is not supported."


#: ISO 4217 code -> number of minor-unit decimals.
CURRENCY_DECIMALS = {
    "USD": 2, "EUR": 2, "GBP": 2, "INR": 2, "AED": 2, "SAR": 2,
    "AUD": 2, "CAD": 2, "CHF": 2, "SEK": 2, "NOK": 2, "DKK": 2,
    "PLN": 2, "CZK": 2, "SGD": 2, "MYR": 2, "THB": 2, "HKD": 2,
    "NZD": 2, "ZAR": 2, "TRY": 2, "PHP": 2, "IDR": 2, "BRL": 2, "MXN": 2,
    # Zero-decimal. Stripe expects the amount as-is, with no x100.
    "JPY": 0, "KRW": 0, "VND": 0, "CLP": 0,
}

#: The canonical currency every plan is priced in and every report aggregates on.
BASE_CURRENCY = "USD"

#: Rounding increment in MINOR units, applied after conversion so prices look deliberate
#: rather than like the output of a converter. Always rounded up (see ``convert``).
#
# Keep the step small relative to a typical price. A coarse step looks tidy on expensive
# items and is grotesque on cheap ones: rounding to the nearest ₹100 turned a ₹17 item into
# ₹99, a 5x markup. Rounding to ₹10 still yields ₹599 for the common case and ₹19 for the
# cheap one.
ROUNDING_STEP = {
    "USD": 100, "EUR": 100, "GBP": 100, "CHF": 100, "AUD": 100, "CAD": 100,
    "INR": 1000,    # nearest 10 rupees, minus ₹1 -> 599, 1299, 19
    "JPY": 10,      # nearest 10 yen (already zero-decimal)
    "AED": 50, "SAR": 50,
}
#: Subtracted after rounding up, to land on 99/9 endings. In MINOR units, so it differs per
#: currency: 1 cent off $7.00 gives $6.99, but 1 paisa off ₹600 gives ₹599.99 — India prices
#: on whole rupees, so the offset there is ₹1 = 100 paise. 0 disables it.
CHARM_OFFSET = {
    "USD": 1, "EUR": 1, "GBP": 1, "CHF": 1, "AUD": 1, "CAD": 1,
    "INR": 100, "JPY": 0, "AED": 0, "SAR": 0,
}


def decimals_for(currency):
    try:
        return CURRENCY_DECIMALS[currency.upper()]
    except KeyError:
        raise UnsupportedCurrency(message=f"Currency '{currency}' is not supported.")


def is_supported(currency):
    return str(currency or "").upper() in CURRENCY_DECIMALS


def to_minor_units(amount, currency):
    """Human amount (Decimal/str) -> integer minor units for storage and for Stripe."""
    factor = Decimal(10) ** decimals_for(currency)
    return int((Decimal(str(amount)) * factor).to_integral_value(rounding=ROUND_FLOOR))


def from_minor_units(minor, currency):
    """Integer minor units -> Decimal human amount, for display and for FX maths."""
    factor = Decimal(10) ** decimals_for(currency)
    return (Decimal(minor) / factor) if factor != 1 else Decimal(minor)


def convert(base_minor, *, to_currency, rate, buffer=Decimal("1.03"), charm=True):
    """Convert a USD minor amount into ``to_currency`` minor units.

    ``rate`` is the mid-market quote (1 USD = rate of the target currency) and ``buffer``
    is the margin protection applied on top of it — it absorbs intra-day FX movement and
    the conversion fee Stripe charges when settling into the account's own currency.

    Rounding is always **upward**. Rounding down can, at the limit, price below the
    supplier's wholesale cost, which turns a sale into a loss silently.
    """
    to_currency = to_currency.upper()
    if to_currency == BASE_CURRENCY:
        return int(base_minor)

    base_amount = from_minor_units(base_minor, BASE_CURRENCY)
    factor = Decimal(10) ** decimals_for(to_currency)
    rate = Decimal(str(rate))

    buffered = int(
        (base_amount * rate * Decimal(str(buffer)) * factor)
        .to_integral_value(rounding=ROUND_CEILING)
    )
    # The true FX value, with no margin protection. Charm rounding may dip into the buffer
    # but must never cross this line — below it the sale is worth less than the money we
    # took, before the supplier is even paid.
    unbuffered = int(
        (base_amount * rate * factor).to_integral_value(rounding=ROUND_CEILING)
    )

    step = ROUNDING_STEP.get(to_currency)
    if not charm or not step:
        return buffered

    # Round up to the next step, then drop the charm offset: 60000 -> 59900 (₹599).
    rounded = -(-buffered // step) * step - CHARM_OFFSET.get(to_currency, 0)
    # If the charm price would fall through the floor, take the next step up instead.
    if rounded < unbuffered:
        rounded += step
    return rounded


def convert_discount(base_minor, *, to_currency, rate, buffer=Decimal("1.03"), max_minor):
    """Convert a fixed discount. Rounds **down** and is capped at ``max_minor``.

    Two separate hazards, both of which end as a database rejection rather than a tidy
    validation error:

    * Rounding up can push the discount past the subtotal.
    * Even rounding down is not enough on its own. The subtotal is charm-rounded *down*
      to a clean price (₹599.02 becomes ₹599) while the discount is not, so a full-value
      discount converts a paisa higher than the thing it is discounting.

    ``max_minor`` is therefore required, not optional — the caller always knows the
    subtotal, and making it mandatory means the unsafe call cannot be written.
    """
    to_currency = to_currency.upper()
    if to_currency == BASE_CURRENCY:
        return min(int(base_minor), int(max_minor))
    base_amount = from_minor_units(base_minor, BASE_CURRENCY)
    converted = base_amount * Decimal(str(rate)) * Decimal(str(buffer))
    minor = int(
        (converted * (Decimal(10) ** decimals_for(to_currency)))
        .to_integral_value(rounding=ROUND_FLOOR)
    )
    return max(min(minor, int(max_minor)), 0)
