import os
import sys
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"] if DEBUG else [])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "django.contrib.sites",
]
THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
]
LOCAL_APPS = [
    "apps.common",
    "apps.administration",
    "apps.accounts",
    "apps.catalog",
    "apps.orders",
    "apps.payments",
    "apps.esims",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    # FIRST, before anything reads the host.
    #
    # It was last (closest to the view) and had no effect in production despite being
    # deployed. HttpRequest.build_absolute_uri() reads _current_scheme_host, a CACHED
    # property — once SecurityMiddleware or CommonMiddleware touches it, the original
    # hostname is frozen for the rest of the request and a later rewrite is ignored.
    # Running first means nothing has read the host yet.
    "apps.accounts.middleware.PublicHostMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Must sit immediately after SecurityMiddleware: it has to see the request before
    # anything else can redirect or reject it, and after the security headers are applied.
    #
    # Django refuses to serve static files when DEBUG=False, expecting nginx or a CDN to do
    # it. There is neither in front of Gunicorn on Railway, so /static/ 404s and the Django
    # admin renders unstyled — the tool you reach for when something is already wrong.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["ATOMIC_REQUESTS"] = False
if not DEBUG:
    DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = env(
        "DB_SSLMODE", default="require"
    )

AUTH_USER_MODEL = "accounts.User"

# --- Authentication backends (Django + allauth) ---
SITE_ID = 1
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# --- Google OAuth via django-allauth (classic redirect flow) ---
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:3000")
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", default="")
GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET", default="")

ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_LOGIN_ON_GET = True
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapters.SocialAccountAdapter"
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APP": {"client_id": GOOGLE_CLIENT_ID, "secret": GOOGLE_CLIENT_SECRET, "key": ""},
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
    }
}
LOGIN_REDIRECT_URL = FRONTEND_BASE_URL + "/account"
ACCOUNT_LOGOUT_REDIRECT_URL = FRONTEND_BASE_URL

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Hashes each filename and pre-compresses it, so files can be served with a far-future
    # cache header and a deploy still busts the cache. Only affects Django's own admin and
    # DRF assets — the storefront is a separate Next.js app.
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

_RENDERERS = ["rest_framework.renderers.JSONRenderer"]
if DEBUG:
    _RENDERERS.append("rest_framework.renderers.BrowsableAPIRenderer")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPagination",
    "PAGE_SIZE": 24,
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_RENDERER_CLASSES": _RENDERERS,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "auth": env("THROTTLE_AUTH", default="10/min"),
        "checkout": env("THROTTLE_CHECKOUT", default="30/min"),
        "payment": env("THROTTLE_PAYMENT", default="30/min"),
        "promo": env("THROTTLE_PROMO", default="30/min"),
        "usage": env("THROTTLE_USAGE", default="20/min"),
        # Guest order lookup returns decrypted eSIM credentials — keep it tight.
        "lookup": env("THROTTLE_LOOKUP", default="10/min"),
        "admin": env("THROTTLE_ADMIN", default="60/min"),
        "agency": env("THROTTLE_AGENCY", default="120/min"),
        "reveal": env("THROTTLE_REVEAL", default="10/hour"),
        "export": env("THROTTLE_EXPORT", default="5/hour"),
    },
}

# Throttle counters live in the cache. A per-process backend (locmem) multiplies every
# limit by the worker count, so production must use a shared backend (enforced below).
CACHES = {"default": env.cache("CACHE_URL", default="locmemcache://")}

if "test" in sys.argv:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
        scope: None for scope in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    }

SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE", default="Lax")
SESSION_COOKIE_DOMAIN = env("SESSION_COOKIE_DOMAIN", default=None)
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Django builds every absolute URL from the host it sees. Requests arrive from the
# Cloudflare Worker proxy, which forwards the visitor's real host in X-Forwarded-Host;
# without this Django used its own Railway hostname instead.
#
# That broke Google sign-in outright. The OAuth redirect_uri was built as
# https://<service>.up.railway.app/accounts/google/login/callback/ rather than
# https://esimflys.com/..., so Google rejected it as an unregistered redirect_uri. And
# registering the Railway URL would NOT have fixed it: the callback would then complete
# on the Railway domain, Django's session cookie would be set there, and the visitor
# would return to esimflys.com signed out. Same-origin cookie delivery is the entire
# reason the Worker proxies /accounts/ instead of the browser calling Railway directly.
#
# Companion to SECURE_PROXY_SSL_HEADER above, which trusts the same proxy for scheme.
USE_X_FORWARDED_HOST = True

# Trusting a client-supplied header is only safe while ALLOWED_HOSTS is an explicit
# list. Django validates the forwarded host against it, and the Railway origin is
# reachable from the internet directly — so with a wildcard anyone could forge the host
# Django builds OAuth callbacks and password-reset links from.
#
# Checked at boot so a wildcard fails the deploy loudly, rather than leaving a
# host-header injection that nothing surfaces until it is exploited.
if not DEBUG and "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS contains '*' while USE_X_FORWARDED_HOST is enabled. Django would "
        "then trust any X-Forwarded-Host, letting a caller control the absolute URLs it "
        "generates. List the real hosts explicitly instead."
    )
# Railway's internal healthcheck probe hits the container directly over plain HTTP,
# bypassing the edge that sets X-Forwarded-Proto. Without this exemption Django 301s
# the probe to https, the prober doesn't follow redirects, and the deploy times out
# waiting for a 200 that never comes — even though the app is healthy and real
# HTTPS traffic through the edge works fine.
SECURE_REDIRECT_EXEMPT = [r"^health/"]
if not DEBUG:
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = bool(SECURE_HSTS_SECONDS)
    SECURE_HSTS_PRELOAD = bool(SECURE_HSTS_SECONDS)
    SECURE_CONTENT_TYPE_NOSNIFF = True

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

# Resend over HTTPS is the production default, NOT SMTP. Outbound SMTP is blocked from
# the container: every one of the first ten emails died with "timed out" against a
# correctly configured smtp.resend.com:587, which answers in 0.19s from a laptop. The
# same container reaches Stripe and eSIM Access over 443 without trouble, so the fix is
# the transport, not the credentials. See apps/common/email.py.
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "apps.common.email.ResendEmailBackend",
)
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="eSIMFlys <no-reply@esimflys.com>")
# Used by ResendEmailBackend. The SMTP settings above stay readable so a deployment
# can fall back to EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend on a host
# that does allow SMTP, without any code change.
RESEND_API_KEY = env("RESEND_API_KEY", default="")

# These five were NEVER read from the environment, and nothing said so.
#
# EMAIL_BACKEND above defaults to Django's SMTP backend in production, but with no host
# configured Django falls back to its own default of localhost:25 — an SMTP server that
# does not exist inside the container. Every send failed silently, which meant:
#
#   accounts/views.py:113      guest checkout OTP codes never arrived, so a guest could
#                              not verify their email and could not receive their eSIM
#   orders/notifications.py:74 order confirmations and eSIM QR delivery never arrived
#
# Setting the variables on the host alone would NOT have fixed it: without the lines
# above, Django reads none of them and keeps dialling localhost.
#
# EMAIL_TIMEOUT is explicit because Django's default is None — no timeout at all. A
# provider that accepts the connection and then stalls would hang the request thread,
# and these sends happen inside the checkout path.
if not DEBUG and EMAIL_BACKEND.endswith("ResendEmailBackend") and not RESEND_API_KEY:
    # Same reasoning as the SMTP guard below: refuse to boot rather than accept orders
    # whose confirmation and QR code can never be delivered.
    raise ImproperlyConfigured(
        "EMAIL_BACKEND is the Resend backend but RESEND_API_KEY is empty, so no email "
        "could be sent. Set RESEND_API_KEY (the same key used as the SMTP password) — or "
        "set EMAIL_BACKEND to django.core.mail.backends.console.EmailBackend if this "
        "deployment must not send mail."
    )

if not DEBUG and EMAIL_BACKEND.endswith("smtp.EmailBackend") and not EMAIL_HOST:
    # Refuse to boot rather than repeat the silent failure. The same pattern guards
    # CACHE_URL and ALLOWED_HOSTS above; both exist because a quiet default cost real
    # debugging time. A deploy that fails here is cheaper than a customer who pays and
    # never receives an eSIM.
    raise ImproperlyConfigured(
        "EMAIL_BACKEND is the SMTP backend but EMAIL_HOST is empty, so Django would send "
        "to localhost:25 and every email would fail silently. Set EMAIL_HOST (Resend: "
        "smtp.resend.com), EMAIL_HOST_USER and EMAIL_HOST_PASSWORD — or set EMAIL_BACKEND "
        "to django.core.mail.backends.console.EmailBackend if this deployment must not "
        "send mail."
    )

FIELD_ENCRYPTION_KEY_VERSION = env.int("FIELD_ENCRYPTION_KEY_VERSION", default=1)
# Retired keys stay in the ring as decrypt-only, so raising the active version never
# orphans ciphertext written under an older one:
#   FIELD_ENCRYPTION_KEYS_JSON={"1":"<old key>","2":"<new key>"}
#   FIELD_ENCRYPTION_KEY_VERSION=2
FIELD_ENCRYPTION_KEYS = {
    int(version): key
    for version, key in env.json("FIELD_ENCRYPTION_KEYS_JSON", default={}).items()
}
FIELD_ENCRYPTION_KEYS.setdefault(
    FIELD_ENCRYPTION_KEY_VERSION, env("FIELD_ENCRYPTION_KEY", default="")
)
ICCID_HMAC_KEY = env("ICCID_HMAC_KEY", default="")

STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY", default="")
STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET", default="")
PAYMENTS_GATEWAY = env("PAYMENTS_GATEWAY", default=("stripe" if STRIPE_SECRET_KEY else "fake"))
ESIM_SUPPLIER_BASE_URL = env("ESIM_SUPPLIER_BASE_URL", default="")
# eSIM Access sends this as the `RT-AccessCode` header (not a Bearer token).
ESIM_SUPPLIER_API_KEY = env("ESIM_SUPPLIER_API_KEY", default="")
# Optional HMAC signing key for `RT-Signature`. Blank = plain access-code auth.
ESIM_SUPPLIER_SECRET_KEY = env("ESIM_SUPPLIER_SECRET_KEY", default="")
ESIM_SUPPLIER_TIMEOUT = env.float("ESIM_SUPPLIER_TIMEOUT", default=30.0)
# The supplier has no sandbox — every call spends real wallet money. Merely holding
# credentials must therefore never arm it: going live is an explicit, deliberate act.
SUPPLIER_GATEWAY = env("SUPPLIER_GATEWAY", default="fake")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}

# --- Multi-currency pricing ----------------------------------------------------------
# Plans are priced once in USD; every other currency is derived at checkout.
#
# Rates are set by hand rather than pulled from a feed. Gross margin across the catalogue
# is a median 67%, so ordinary FX drift cannot threaten a sale, and a daily provider would
# be infrastructure managing a risk that does not exist. Quote them a little conservatively
# and review occasionally.
#
# The exception worth knowing: a handful of expensive plans run near 20% margin
# (MV-20GB-30D-V1 is retail $129.99 against $104.16 wholesale). If a currency drifts ~20%
# against a fixed rate those turn into a loss per sale, so glance at these every month or
# two rather than never.
FX_RATES = {
    "INR": env("FX_RATE_INR", default="88"),
}
# Applied on top of the rate: absorbs drift between reviews and the conversion fee Stripe
# charges when settling into the account's own currency (this account settles in GBP).
FX_BUFFER = env("FX_BUFFER", default="1.03")

VALID_PAYMENTS_GATEWAYS = {"stripe", "fake"}
VALID_SUPPLIER_GATEWAYS = {"esim_access", "fake"}
# Both factories pick the real provider by exact name, so an unrecognised value would
# otherwise fall through to the fake one — a typo would silently sell fake eSIMs.
if PAYMENTS_GATEWAY not in VALID_PAYMENTS_GATEWAYS:
    raise ImproperlyConfigured(
        f"PAYMENTS_GATEWAY={PAYMENTS_GATEWAY!r} is not one of {sorted(VALID_PAYMENTS_GATEWAYS)}."
    )
# No test may ever reach a real vendor.
#
# [MEASURED] 2026-08-24: `manage.py test apps.orders` made a live
# POST https://api.esimaccess.com/api/v1/open/esim/order using the developer's own .env
# credentials, because one test class lacked `@override_settings(SUPPLIER_GATEWAY="fake")`
# and .env sets `SUPPLIER_GATEWAY=esim_access`. That call happened to fail logically, so no
# wallet money moved — but nothing in the arrangement guaranteed that, and a fixture the
# supplier accepted would have bought an eSIM every time the suite ran.
#
# Forcing it here rather than remembering a decorator on every class: the per-class
# overrides are still correct and still work, they just stop being the only thing standing
# between a test run and a real purchase.
if "test" in sys.argv:
    SUPPLIER_GATEWAY = "fake"

if SUPPLIER_GATEWAY not in VALID_SUPPLIER_GATEWAYS:
    raise ImproperlyConfigured(
        f"SUPPLIER_GATEWAY={SUPPLIER_GATEWAY!r} is not one of {sorted(VALID_SUPPLIER_GATEWAYS)}."
    )

# Demo deployments may serve fake providers; production must opt in loudly and explicitly.
ALLOW_FAKE_GATEWAYS = env.bool("ALLOW_FAKE_GATEWAYS", default=False)

if not DEBUG:
    if not ALLOW_FAKE_GATEWAYS:
        _fake = [
            name
            for name, value in (
                ("PAYMENTS_GATEWAY", PAYMENTS_GATEWAY),
                ("SUPPLIER_GATEWAY", SUPPLIER_GATEWAY),
            )
            if value == "fake"
        ]
        if _fake:
            raise ImproperlyConfigured(
                "Fake providers refuse to run in production: "
                + ", ".join(_fake)
                + ". Configure the real gateway, or set ALLOW_FAKE_GATEWAYS=true for a "
                "deliberately non-selling demo deployment."
            )
    _required_secrets = [
        "FIELD_ENCRYPTION_KEY",
        "ICCID_HMAC_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "ESIM_SUPPLIER_BASE_URL",
        "ESIM_SUPPLIER_API_KEY",
    ]
    if "locmem" in CACHES["default"]["BACKEND"].lower():
        raise ImproperlyConfigured(
            "CACHE_URL must point at a shared cache backend in production. LocMemCache is "
            "per-process, so rate limits would be multiplied by the worker count. Use e.g. "
            "redis://host:6379/0 or dbcache://throttle_cache."
        )
    _missing = [name for name in _required_secrets if not env(name, default="")]
    if _missing:
        raise ImproperlyConfigured(
            "Missing required production settings: " + ", ".join(_missing)
        )
