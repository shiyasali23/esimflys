"""The Resend HTTP backend.

The bug this replaces was silent for weeks: SMTP timed out in the container, the
notification rows recorded "timed out", and nothing turned that into a signal anyone
saw. So the tests here care about two things in equal measure — that a message actually
goes out, and that a FAILURE still reaches the retry ledger rather than being counted
as sent.
"""

from unittest import mock

import httpx
from django.core.mail import EmailMultiAlternatives, send_mail
from django.test import TestCase, override_settings

from apps.common.email import ResendEmailBackend

BACKEND = "apps.common.email.ResendEmailBackend"


def fake_client(status=200, body='{"id":"re_1"}', capture=None):
    """A stand-in httpx.Client that records the request instead of making one."""

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, headers=None, content=None):
            if capture is not None:
                capture.append({"url": url, "headers": headers, "content": content})
            return httpx.Response(status, text=body, request=httpx.Request("POST", url))

    return Client


@override_settings(
    EMAIL_BACKEND=BACKEND, RESEND_API_KEY="re_test_key",
    DEFAULT_FROM_EMAIL="eSIMFlys <no-reply@esimflys.com>",
)
class ResendBackendTests(TestCase):
    def test_sends_over_https_not_smtp(self):
        """The whole point: 443, which the container can reach, not 587, which it cannot."""
        sent = []
        with mock.patch("apps.common.email.httpx.Client", fake_client(capture=sent)):
            count = send_mail("Subject", "Body", None, ["buyer@example.com"])

        self.assertEqual(count, 1)
        self.assertEqual(sent[0]["url"], "https://api.resend.com/emails")
        self.assertEqual(sent[0]["headers"]["Authorization"], "Bearer re_test_key")

    def test_html_alternative_is_sent_as_html_not_as_text(self):
        """`notifications.py` builds EmailMultiAlternatives and attaches the rendered
        template as text/html. Reading only `.body` would mail raw markup to customers."""
        import json

        sent = []
        message = EmailMultiAlternatives(
            "Your eSIM", "plain version", None, ["buyer@example.com"]
        )
        message.attach_alternative("<h1>Your eSIM</h1>", "text/html")
        with mock.patch("apps.common.email.httpx.Client", fake_client(capture=sent)):
            message.send()

        payload = json.loads(sent[0]["content"])
        self.assertEqual(payload["text"], "plain version")
        self.assertEqual(payload["html"], "<h1>Your eSIM</h1>")
        self.assertEqual(payload["to"], ["buyer@example.com"])

    def test_a_rejection_raises_so_the_notification_records_it(self):
        """`_send_one` in orders.notifications catches this and writes the message onto
        the row. A backend that returned 0 quietly would mark undelivered mail as sent
        and remove the only evidence that anything was wrong."""
        with mock.patch(
            "apps.common.email.httpx.Client",
            fake_client(status=422, body='{"message":"domain is not verified"}'),
        ):
            with self.assertRaises(RuntimeError) as caught:
                send_mail("Subject", "Body", None, ["buyer@example.com"])

        self.assertIn("domain is not verified", str(caught.exception))

    def test_a_network_error_propagates(self):
        class Boom:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, *a, **k):
                raise httpx.ConnectTimeout("timed out")

        with mock.patch("apps.common.email.httpx.Client", Boom):
            with self.assertRaises(httpx.ConnectTimeout):
                send_mail("Subject", "Body", None, ["buyer@example.com"])

    def test_fail_silently_still_honoured(self):
        with mock.patch("apps.common.email.httpx.Client", fake_client(status=500)):
            count = send_mail(
                "Subject", "Body", None, ["buyer@example.com"], fail_silently=True
            )
        self.assertEqual(count, 0)

    @override_settings(RESEND_API_KEY="")
    def test_a_missing_key_is_an_error_not_a_silent_noop(self):
        """The failure mode being replaced was silence. Missing config must look like
        the outage it is."""
        with self.assertRaises(RuntimeError):
            send_mail("Subject", "Body", None, ["buyer@example.com"])

    def test_never_claims_to_have_sent_an_empty_batch(self):
        self.assertEqual(ResendEmailBackend().send_messages([]), 0)
