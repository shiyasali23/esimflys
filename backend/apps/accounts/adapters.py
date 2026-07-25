from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth import get_user_model

User = get_user_model()


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Link a Google sign-in to an existing account when the verified email matches.

    Without this, a customer who first registered with email/password and later clicks
    "Continue with Google" would get a *second*, duplicate account. We connect the Google
    identity to the existing user instead — but only when the provider vouches for the
    email (Google's ``email_verified``), so this cannot be used to hijack an account by
    claiming someone else's address.
    """

    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = (getattr(sociallogin.user, "email", "") or "").strip().lower()
        if not email:
            return

        email_is_verified = any(
            (address.email or "").strip().lower() == email and address.verified
            for address in sociallogin.email_addresses
        )
        if not email_is_verified:
            return

        existing = User.objects.filter(email__iexact=email, is_active=True).first()
        if existing is not None:
            sociallogin.connect(request, existing)
