"""Mail is never queued to an address nobody can receive at.

[MEASURED] The demo seeder writes ~108 `@example.com` travellers. Suppressing them after
the run was racy — the worker polls every two seconds and had already claimed one into
`processing`, which then made four real attempts and collected four 422s from Resend
before anyone noticed. A burst of hard bounces is how a sending domain's reputation is
damaged, and the real customers' order confirmations go out through that same domain.

Deciding at creation removes the race entirely, and it is correct behaviour regardless of
demos: RFC 2606 and RFC 6761 reserve these names precisely so test data cannot reach a
real mailbox.
"""

from django.test import TestCase

from apps.orders.notifications import is_undeliverable, queue_notification
from apps.orders.models import Notification


class ReservedRecipientTests(TestCase):
    def _queue(self, recipient, key="k1"):
        return queue_notification(
            template_code="esim-ready", recipient=recipient, idempotency_key=key
        )

    def test_a_reserved_address_is_never_queued_for_sending(self):
        note = self._queue("fathima.koya@example.com")
        self.assertEqual(note.status, "cancelled")
        self.assertEqual(
            Notification.objects.filter(status__in=("queued", "retrying")).count(), 0
        )

    def test_the_row_still_exists_as_evidence(self):
        """An eSIM whose delivery has no record at all is worse than one recorded as
        deliberately not sent."""
        self._queue("fathima.koya@example.com")
        note = Notification.objects.get()
        self.assertIn("not deliverable", note.failure_message)

    def test_a_real_address_is_queued_normally(self):
        note = self._queue("buyer@gmail.com")
        self.assertEqual(note.status, "queued")

    def test_covers_every_reserved_name(self):
        for address in [
            "a@example.com", "a@example.net", "a@example.org",
            "a@anything.test", "a@anything.invalid", "a@anything.localhost",
            "a@sub.example.com",
        ]:
            self.assertTrue(is_undeliverable(address), address)

    def test_does_not_catch_a_real_domain_that_merely_contains_example(self):
        """`example.com.br` and `myexample.com` are real domains somebody may own."""
        for address in ["a@example.com.br", "a@myexample.com", "a@examples.com"]:
            self.assertFalse(is_undeliverable(address), address)

    def test_treats_a_malformed_address_as_undeliverable(self):
        for address in ["", None, "not-an-address"]:
            self.assertTrue(is_undeliverable(address))

    def test_is_case_insensitive(self):
        self.assertTrue(is_undeliverable("A@EXAMPLE.COM"))
