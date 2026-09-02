"""What a customer actually receives.

Every check here comes from something that shipped to a real inbox:

* a multi-line ``{# #}`` rendered verbatim, so an engineering note about smdpStatus and
  iPhone 13 appeared as body copy in the eSIM email;
* the order receipt read "Total paid: 1499 USD (minor units)";
* every message carried raw HTML as its text/plain part;
* the password reset carried "uid: MQ / token: …" and no link at all.

None of these were type errors or exceptions — every one rendered successfully and was
delivered. They are only visible by looking at the output, which is what this file does.
"""

import re

from django.conf import settings
from django.core import mail
from django.template import Template, Context
from django.template.loader import render_to_string
from django.test import TestCase, override_settings

from apps.orders.models import Notification
from apps.orders import notifications

BASE = {"site_url": "https://esimflys.com", "support_email": "support@example-real.com"}

CASES = {
    "order-confirmation": dict(
        BASE, order_number="ESF-1", total_paid="$14.99",
        items=[{"product_name": "UK 1 GB", "country_name": "United Kingdom", "line_total": "$14.99"}],
    ),
    "esim-ready": dict(
        BASE, order_number="ESF-1", plan_name="UK 1 GB", country_name="United Kingdom",
        data_label="1 GB", validity_label="7 days",
        activation_code="LPA:1$rsp.redtea.io$CDB21D06", qr_code_url="https://q.test/a.png",
    ),
    "refund-confirmation": dict(BASE, order_number="ESF-1", refund_total="$14.99"),
    "topup-confirmation": dict(BASE, order_number="ESF-1"),
    "password-reset": dict(BASE, reset_url="https://esimflys.com/auth/reset-password?uid=MQ&token=t"),
}

#: Anything here reaching a reader means a template tag escaped into the body.
TEMPLATE_SYNTAX = re.compile(r"\{%|%\}|\{\{|\}\}|\{#|#\}")


class NoTemplateSyntaxReachesTheReader(TestCase):
    """The bug in the screenshot: Django's {# #} is SINGLE-LINE only."""

    def test_django_hash_comments_do_not_span_lines(self):
        """The mechanism itself, so the reason this file exists cannot be forgotten."""
        self.assertEqual(Template("A{# x #}B").render(Context({})), "AB")
        leaked = Template("A{# x\ny #}B").render(Context({}))
        self.assertIn("{#", leaked, "multi-line {# #} is NOT a comment in Django")

    def test_no_rendered_email_contains_template_syntax(self):
        for name, ctx in CASES.items():
            for ext in ("html", "txt"):
                out = render_to_string(f"emails/{name}.{ext}", ctx)
                found = TEMPLATE_SYNTAX.findall(out)
                self.assertEqual(found, [], f"{name}.{ext} leaked {found}")

    def test_no_engineering_note_reaches_the_customer(self):
        """The exact words a customer read in the screenshot."""
        out = render_to_string("emails/esim-ready.html", CASES["esim-ready"])
        for phrase in ("smdpStatus", "iPhone 13", "A real customer installed"):
            self.assertNotIn(phrase, out)


class MoneyIsReadable(TestCase):
    def test_no_email_says_minor_units(self):
        for name, ctx in CASES.items():
            for ext in ("html", "txt"):
                out = render_to_string(f"emails/{name}.{ext}", ctx).lower()
                self.assertNotIn("minor unit", out, f"{name}.{ext}")

    def test_format_minor_renders_a_price_a_person_can_read(self):
        from apps.common.currency import format_minor

        self.assertEqual(format_minor(1499, "USD"), "$14.99")
        self.assertEqual(format_minor(36900, "INR"), "₹369.00")

    def test_zero_decimal_currency_is_not_divided_by_a_hundred(self):
        """JPY has no minor unit. Dividing would under-report the price 100x."""
        from apps.common.currency import format_minor

        self.assertEqual(format_minor(1500, "JPY"), "¥1,500")


class EveryEmailIsReachable(TestCase):
    def test_support_address_appears_in_every_email(self):
        for name, ctx in CASES.items():
            for ext in ("html", "txt"):
                out = render_to_string(f"emails/{name}.{ext}", ctx)
                self.assertIn(ctx["support_email"], out, f"{name}.{ext}")

    def test_password_reset_carries_a_link_not_raw_values(self):
        for ext in ("html", "txt"):
            out = render_to_string(f"emails/password-reset.{ext}", CASES["password-reset"])
            self.assertIn("https://esimflys.com/auth/reset-password?uid=", out)
            self.assertNotIn("uid: ", out)
            self.assertNotIn("token: ", out)

    def test_the_esim_email_carries_the_code_itself(self):
        """A traveller has no data until this eSIM works, so 'sign in to view' is a trap."""
        for ext in ("html", "txt"):
            out = render_to_string(f"emails/esim-ready.{ext}", CASES["esim-ready"])
            self.assertIn("LPA:1$rsp.redtea.io$CDB21D06", out)


@override_settings(SUPPORT_EMAIL="support@example-real.com")
class DeliveredMessageShape(TestCase):
    def _send(self, template_code="order-confirmation"):
        mail.outbox = []
        note = Notification.objects.create(
            template_code=template_code, recipient="buyer@gmail.com",
            idempotency_key=f"k-{template_code}", channel="email", status="queued",
        )
        notifications._deliver(note)
        self.assertEqual(len(mail.outbox), 1, "nothing was sent")
        return mail.outbox[0]

    def test_the_plain_text_part_is_text_not_html(self):
        """`EmailMultiAlternatives(subject, body)` treats body as text/plain. This module
        used to pass the rendered HTML in, so every message's text part was markup."""
        msg = self._send()
        self.assertNotIn("<html", msg.body.lower())
        self.assertNotIn("<td", msg.body.lower())
        self.assertNotIn("style=", msg.body.lower())

    def test_an_html_alternative_is_attached_and_is_html(self):
        msg = self._send()
        html = [c for c, m in msg.alternatives if m == "text/html"]
        self.assertEqual(len(html), 1)
        self.assertIn("<html", html[0].lower())

    def test_the_two_parts_are_not_the_same_string(self):
        msg = self._send()
        html = [c for c, m in msg.alternatives if m == "text/html"][0]
        self.assertNotEqual(msg.body, html)

    def test_reply_goes_somewhere_a_person_reads(self):
        msg = self._send()
        self.assertEqual(msg.reply_to, ["support@example-real.com"])
        self.assertNotIn("no-reply", " ".join(msg.reply_to))

    def test_the_subject_is_specific_rather_than_generic(self):
        """"eSIMFlys — order confirmed" tells an inbox nothing. The order number is what
        someone searches for months later when they need the receipt."""
        note = Notification.objects.create(
            template_code="order-confirmation", recipient="buyer@gmail.com",
            idempotency_key="k-subject", channel="email", status="queued",
        )
        subject, _, _ = notifications.TEMPLATES["order-confirmation"]
        rendered = subject.format(**notifications._context(note))
        self.assertIn("{order_number}", subject, "subject must interpolate the order")
        self.assertNotIn("{", rendered, "subject left an unfilled placeholder")


class OneTapInstallLink(TestCase):
    """Apple's universal link, iOS 17.4+.

    `esimsetup.apple.com` has no A record — iOS resolves it inside the OS — so on any
    other device the same link dies as "Server Not Found". That is why the email labels
    it as the iPhone route and keeps the manual code directly beneath it.
    """

    def test_builds_the_documented_url_with_the_payload_verbatim(self):
        url = notifications._apple_install_url("LPA:1$rsp.redtea.io$ABC123")
        self.assertEqual(
            url,
            "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$rsp.redtea.io$ABC123",
        )
        self.assertNotIn("%24", url, "the $ must not be percent-encoded")
        self.assertTrue(url.startswith("https://esimsetup.apple.com/esim_qrcode_provisioning"))

    def test_refuses_anything_that_is_not_an_lpa_string(self):
        for bad in ("", None, "not-an-lpa", "LPA:1$only-one-part", "http://evil.test/x"):
            self.assertIsNone(notifications._apple_install_url(bad), bad)

    def test_the_email_offers_it_and_still_shows_the_manual_code(self):
        ctx = dict(CASES["esim-ready"], install_url="https://esimsetup.apple.com/x")
        for ext in ("html", "txt"):
            out = render_to_string(f"emails/esim-ready.{ext}", ctx)
            self.assertIn("https://esimsetup.apple.com/x", out)
            self.assertIn("LPA:1$rsp.redtea.io$CDB21D06", out, "manual code must remain")
            self.assertIn("17.4", out, "must say which devices it works on")

    def test_the_email_omits_the_button_when_there_is_no_link(self):
        out = render_to_string("emails/esim-ready.html", CASES["esim-ready"])
        self.assertNotIn("esimsetup.apple.com", out)
        self.assertIn("LPA:1$rsp.redtea.io$CDB21D06", out)
