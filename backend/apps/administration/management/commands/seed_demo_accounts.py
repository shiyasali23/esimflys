"""Create the accounts a frontend engineer needs to develop the admin panels.

Clicking through Django admin to build a staff user, attach a group, create an agency and
add a membership is slow and easy to get subtly wrong (a bare ``is_staff`` user has **no**
platform capability, which looks like a broken API). This command produces every role in
one reproducible step and prints the credentials.

DEBUG-only unless ``--force`` is passed: it creates known-password accounts, which must
never exist in production.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Organization, OrganizationMember
from apps.accounts.services import create_agency_tracking_code
from apps.administration.roles import PLATFORM_ROLE_CAPABILITIES

User = get_user_model()

DEFAULT_PASSWORD = "DevPass!2345"

#: (email, platform role/group). "superuser" is the flag, not a group.
PLATFORM_ACCOUNTS = [
    ("root@esimflys.test", "superuser"),
    ("platform@esimflys.test", "platform_admin"),
    ("support@esimflys.test", "support_admin"),
    ("finance@esimflys.test", "finance_admin"),
    ("readonly@esimflys.test", "readonly_admin"),
]

#: (email, agency role)
AGENCY_ACCOUNTS = [
    ("agency-owner@esimflys.test", "owner"),
    ("agency-admin@esimflys.test", "admin"),
    ("agency-buyer@esimflys.test", "buyer"),
    ("agency-viewer@esimflys.test", "viewer"),
]


class Command(BaseCommand):
    help = (
        "Seed development accounts for the platform and agency admin panels: one user per "
        "platform role, an active agency with one user per agency role, and a tracking code."
    )

    def add_arguments(self, parser):
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument("--agency-name", default="Sunrise Travel")
        parser.add_argument("--tracking-code", default="SUNRISE20")
        parser.add_argument(
            "--force", action="store_true",
            help="Allow seeding when DEBUG=False. Never do this in production.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refusing to create known-password accounts with DEBUG=False. "
                "Use --force only if you are certain this is not production."
            )

        password = options["password"]
        with transaction.atomic():
            platform = self._seed_platform_accounts(password)
            agency, members = self._seed_agency(
                options["agency_name"], options["tracking_code"], password
            )

        self._report(platform, agency, members, password)

    def _seed_platform_accounts(self, password):
        created = []
        for email, role in PLATFORM_ACCOUNTS:
            user, _ = User.objects.get_or_create(email=email)
            user.is_active = True
            user.is_staff = True                      # Django admin access
            user.is_superuser = role == "superuser"
            user.set_password(password)
            user.save()

            user.groups.clear()
            if role in PLATFORM_ROLE_CAPABILITIES and role != "superuser":
                user.groups.add(Group.objects.get_or_create(name=role)[0])
            created.append((email, role))
        return created

    def _seed_agency(self, name, tracking_code, password):
        agency, _ = Organization.objects.get_or_create(
            name=name,
            defaults={
                "organization_type": "travel_agency",
                "billing_email": "ops@sunrise.test",
                "support_email": "help@sunrise.test",
                "country": "AE",
            },
        )
        # Must be active or every agency endpoint correctly returns 404.
        if agency.status != "active":
            agency.status = "active"
            agency.save(update_fields=["status"])

        members = []
        for email, role in AGENCY_ACCOUNTS:
            user, _ = User.objects.get_or_create(email=email)
            user.is_active = True
            user.set_password(password)
            user.save()
            membership, _ = OrganizationMember.objects.get_or_create(
                organization=agency, user=user, defaults={"role": role}
            )
            if membership.role != role or membership.status != "active":
                membership.role = role
                membership.status = "active"
                membership.save(update_fields=["role", "status"])
            members.append((email, role))

        from apps.orders.models import PromoCode

        if not PromoCode.objects.filter(code=tracking_code).exists():
            create_agency_tracking_code(agency, code=tracking_code, commission_bps=2000)
        return agency, members

    def _report(self, platform, agency, members, password):
        write = self.stdout.write
        write("")
        write(self.style.MIGRATE_HEADING("Platform admin accounts  →  /api/v1/admin/"))
        for email, role in platform:
            write(f"  {email:<32} {role}")
        write("")
        write(self.style.MIGRATE_HEADING(f"Agency accounts  →  /api/v1/agency/{agency.id}/"))
        for email, role in members:
            write(f"  {email:<32} {role}")
        write("")
        write(f"  password for every account: {password}")
        write(f"  agency organization_id:     {agency.id}")
        write("")
        write(self.style.WARNING(
            "  Note: is_staff alone grants NO platform API access — the group is what "
            "carries the capability."
        ))
        write(self.style.SUCCESS("  done. Log in via POST /api/v1/auth/login/"))
