from allauth.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import redirect
from django.utils.http import urlencode

from .services import is_agency_account

User = get_user_model()


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Google sign-in policy.

    Two rules:

    1. **Agency accounts may not use social login.** Their credentials are issued by the
       platform and cannot be self-managed, so allowing Google would be a way around that
       control — whoever holds the agency's Google account could reach the agency panel
       without the platform ever issuing them access.
    2. **Customers are linked by verified email.** Someone who registered with a password
       and later clicks "Continue with Google" gets the *same* account rather than a
       duplicate — but only when the provider vouches for the address, so this cannot be
       used to take over an account by claiming someone else's email.
    """

    def _reject(self, reason):
        target = settings.FRONTEND_BASE_URL.rstrip("/") + "/auth/signin?" + urlencode(
            {"error": reason}
        )
        raise ImmediateHttpResponse(redirect(target))

    def pre_social_login(self, request, sociallogin):
        email = (getattr(sociallogin.user, "email", "") or "").strip().lower()

        # Rule 1 — block before any account is created or connected.
        if email and is_agency_account(email=email):
            self._reject("social_login_not_allowed_for_agency")
        if sociallogin.is_existing and is_agency_account(user=sociallogin.user):
            self._reject("social_login_not_allowed_for_agency")

        if sociallogin.is_existing or not email:
            return

        # Rule 2 — link to an existing account only on a provider-verified email.
        email_is_verified = any(
            (address.email or "").strip().lower() == email and address.verified
            for address in sociallogin.email_addresses
        )
        if not email_is_verified:
            return

        existing = User.objects.filter(email__iexact=email, is_active=True).first()
        if existing is not None:
            if is_agency_account(user=existing):
                self._reject("social_login_not_allowed_for_agency")
            sociallogin.connect(request, existing)
