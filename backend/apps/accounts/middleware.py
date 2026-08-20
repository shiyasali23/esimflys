from urllib.parse import urlparse

from django.conf import settings


class PublicHostMiddleware:
    """Make Django build /accounts/ URLs from the public site, not the origin host.

    Django derives every absolute URL from the host on the request, and behind this
    deployment that host is wrong. The browser talks to esimflys.com, a Cloudflare Worker
    proxies /accounts/ to Railway, and Railway's edge then REPLACES X-Forwarded-Host with
    the host it received — the Railway hostname. The Worker's value never reaches Django.

    [VERIFIED] in production with USE_X_FORWARDED_HOST enabled and ALLOWED_HOSTS an
    explicit list: a forged `X-Forwarded-Host: evil.example.com` returned 302, not the 400
    Django raises for a host outside ALLOWED_HOSTS. Django never saw the header. That is
    why USE_X_FORWARDED_HOST does not fix this and cannot.

    The symptom was Google sign-in failing with redirect_uri_mismatch, because allauth
    built https://<service>.up.railway.app/accounts/google/login/callback/. Registering
    that URL would not have helped: the callback would then complete on the Railway
    domain, the session cookie would be set there, and the visitor would come back to
    esimflys.com signed out.

    Rewriting the host rather than overriding allauth's adapter, because allauth builds
    the redirect_uri along TWO paths — the provider for the authorize redirect and the
    adapter for the token exchange — and Google requires both to be byte-identical.
    Overriding the adapter alone changed only the second and left the mismatch in place;
    that was tried and measured before this was written. Fixing the host fixes both at
    once, and every other absolute URL allauth generates with them.

    The value comes from FRONTEND_BASE_URL, which is set on the server, so no proxy and
    no caller can influence it. This is NOT the same as trusting a forwarded header.

    Scoped to /accounts/ deliberately. The API authenticates by session cookie and builds
    no absolute URLs, and Railway's healthcheck probe arrives on a different host that
    must keep resolving as itself — settings.py:207 records that probe breaking a deploy
    once already.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.public_host = urlparse(settings.FRONTEND_BASE_URL).netloc

    def __call__(self, request):
        if self.public_host and request.path.startswith("/accounts/"):
            request.META["HTTP_HOST"] = self.public_host
            # build_absolute_uri() caches scheme+host on first use. Running first should
            # mean nothing has read it yet, but dropping any cached value costs nothing
            # and makes the rewrite correct regardless of middleware order.
            request.__dict__.pop("_current_scheme_host", None)
        response = self.get_response(request)
        # Diagnostic. Four deploys shipped this middleware with no change in production
        # behaviour, which cannot be explained by the code itself — the same code is
        # correct locally. This header proves whether it is running at all: absent means
        # the container is not executing this file, and no amount of editing it will help.
        response["X-Public-Host"] = self.public_host or "unset"
        response["X-Host-Seen"] = request.get_host()
        return response
