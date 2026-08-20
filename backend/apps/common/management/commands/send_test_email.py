from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Prove email delivery from inside the container.

    Email failed silently in production for the whole life of this deployment: the SMTP
    backend was selected but no EMAIL_HOST was ever read, so Django dialled localhost:25
    and every send raised into a handler that logged and moved on. Nothing surfaced.

    Inferring delivery from "the code calls send_mail" is exactly the mistake that hid
    it. This sends a real message over the real connection from the real host, and prints
    the provider's own error when it fails.

    Usage:
        railway run python manage.py send_test_email you@example.com
    """

    help = "Send one test email through the configured backend and report what happened."

    def add_arguments(self, parser):
        parser.add_argument("recipient", help="Address to send the test message to.")

    def handle(self, *args, **options):
        recipient = options["recipient"]

        # Printed before sending, so a misconfiguration is visible even if the send hangs.
        # The password is reported only as set/not set — never echoed.
        self.stdout.write("Configuration:")
        for label, value in (
            ("EMAIL_BACKEND", settings.EMAIL_BACKEND),
            ("EMAIL_HOST", settings.EMAIL_HOST or "(empty)"),
            ("EMAIL_PORT", settings.EMAIL_PORT),
            ("EMAIL_HOST_USER", settings.EMAIL_HOST_USER or "(empty)"),
            ("EMAIL_HOST_PASSWORD", "set" if settings.EMAIL_HOST_PASSWORD else "NOT SET"),
            ("EMAIL_USE_TLS", settings.EMAIL_USE_TLS),
            ("DEFAULT_FROM_EMAIL", settings.DEFAULT_FROM_EMAIL),
        ):
            self.stdout.write(f"  {label} = {value}")

        # Opened explicitly so a refused connection, bad credentials or TLS failure is
        # reported as itself, rather than surfacing later as an opaque send failure.
        try:
            connection = get_connection(fail_silently=False)
            connection.open()
        except Exception as exc:
            raise CommandError(
                f"Could not open a connection to {settings.EMAIL_HOST}:{settings.EMAIL_PORT} "
                f"-- {type(exc).__name__}: {exc}"
            ) from exc
        self.stdout.write(self.style.SUCCESS("Connection opened."))

        try:
            sent = send_mail(
                subject="eSIMFlys test email",
                message=(
                    "If you are reading this, outbound email works.\n\n"
                    "Sent by manage.py send_test_email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                # Never silent. The whole point is to see the failure.
                fail_silently=False,
                connection=connection,
            )
        except Exception as exc:
            raise CommandError(f"Send failed -- {type(exc).__name__}: {exc}") from exc
        finally:
            connection.close()

        if sent != 1:
            # The provider accepted the connection but did not take the message — usually
            # an unverified sending domain or a From address the account may not use.
            raise CommandError(
                f"The backend reported {sent} messages sent, expected 1. The connection "
                f"works, so check that the sending domain is verified with your provider "
                f"and that {settings.DEFAULT_FROM_EMAIL} is an allowed sender."
            )

        self.stdout.write(self.style.SUCCESS(f"Sent 1 message to {recipient}."))
        self.stdout.write(
            "Accepted by the provider. That is not the same as delivered -- check the "
            "inbox, and the provider's own dashboard for bounces."
        )
