"""Create or update the Django admin superuser from the environment.

Exists because there is no other way into this database. `railway ssh` fails with
"Host key verification failed", the Postgres service exposes no public TCP proxy, and
the admin API deliberately has no promo-code or raw-data endpoints. That left no route
to production data at all — which turned a one-row fix into a deploy.

Idempotent by design: it is wired into the container CMD, so it runs on every boot.
With the two variables unset it does nothing and says so, which is the normal state for
an environment that does not want a password-based admin.

Guarded with `|| true` in the Dockerfile. A failure here must never stop the container
from starting — the site serving is worth more than the admin login.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ensure a Django superuser exists, from DJANGO_SUPERUSER_EMAIL/PASSWORD."

    def handle(self, *args, **options):
        email = (os.environ.get("DJANGO_SUPERUSER_EMAIL") or "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD") or ""

        if not email or not password:
            self.stdout.write("ensure_superuser: credentials not set — skipping.")
            return

        if len(password) < 12:
            # A weak password on an endpoint that can edit orders, refunds and promo
            # codes is worse than no admin login at all.
            self.stderr.write("ensure_superuser: password shorter than 12 characters — refusing.")
            return

        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(email=email)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(f"ensure_superuser: {'created' if created else 'updated'} {email}")
