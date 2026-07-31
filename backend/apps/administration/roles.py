"""Declarative role → capability matrix.

Kept as data, in one file, rather than as ``if role == "owner"`` checks scattered through
views. Adding a capability is a one-line change here and is immediately covered by the
permission-matrix tests.

Agency role names must stay in sync with
:data:`apps.accounts.models.MEMBER_ROLES` — :func:`check_role_definitions` asserts that,
and a test calls it.
"""

from apps.accounts.models import MEMBER_ROLES

# --- Agency capabilities -------------------------------------------------------------

VIEW_DASHBOARD = "agency.view_dashboard"
VIEW_REPORTS = "agency.view_reports"
VIEW_COMMISSIONS = "agency.view_commissions"
MANAGE_PROFILE = "agency.manage_profile"
MANAGE_STAFF = "agency.manage_staff"
MANAGE_CUSTOMERS = "agency.manage_customers"
CREATE_ORDERS = "agency.create_orders"
VIEW_CREDENTIALS = "agency.view_credentials"
REQUEST_REFUNDS = "agency.request_refunds"
MANAGE_PRICING = "agency.manage_pricing"
VIEW_ACTIVITY = "agency.view_activity"

#: Capabilities granted to each agency role. Deliberately explicit — no inheritance chain,
#: because "admin inherits buyer" is exactly the kind of implicit rule that leaks authority.
AGENCY_ROLE_CAPABILITIES = {
    "owner": frozenset({
        VIEW_DASHBOARD, VIEW_REPORTS, VIEW_COMMISSIONS, MANAGE_PROFILE, MANAGE_STAFF,
        MANAGE_CUSTOMERS, CREATE_ORDERS, VIEW_CREDENTIALS, REQUEST_REFUNDS,
        MANAGE_PRICING, VIEW_ACTIVITY,
    }),
    "admin": frozenset({
        VIEW_DASHBOARD, VIEW_REPORTS, VIEW_COMMISSIONS, MANAGE_PROFILE, MANAGE_STAFF,
        MANAGE_CUSTOMERS, CREATE_ORDERS, VIEW_CREDENTIALS, REQUEST_REFUNDS, VIEW_ACTIVITY,
    }),
    "buyer": frozenset({
        VIEW_DASHBOARD, VIEW_REPORTS, VIEW_COMMISSIONS, MANAGE_CUSTOMERS, CREATE_ORDERS,
        VIEW_CREDENTIALS,
    }),
    "viewer": frozenset({VIEW_DASHBOARD, VIEW_REPORTS, VIEW_COMMISSIONS}),
}

#: Capabilities no agency role may ever hold. Enforced as a hard assertion so that a future
#: edit granting, say, commission editing to an owner fails the test suite loudly.
AGENCY_FORBIDDEN_CAPABILITIES = frozenset({
    "platform.manage_commission_rate",
    "platform.execute_refund",
    "platform.manage_pricing",
    "platform.manage_roles",
})

#: Role seniority, used to prevent privilege escalation: a member may never grant or assign
#: a role ranked above their own.
AGENCY_ROLE_RANK = {"viewer": 0, "buyer": 1, "admin": 2, "owner": 3}


# --- Platform capabilities -----------------------------------------------------------

PLATFORM_ROLES = (
    "superuser",
    "platform_admin",
    "support_admin",
    "finance_admin",
    "readonly_admin",
)

VIEW_PLATFORM_DASHBOARD = "platform.view_dashboard"
MANAGE_AGENCY = "platform.manage_agency"
VIEW_CUSTOMER = "platform.view_customer"
VIEW_ORDER = "platform.view_order"
MANAGE_ORDER = "platform.manage_order"
MANAGE_REFUND = "platform.execute_refund"
MANAGE_COMMISSION = "platform.manage_commission_rate"
VIEW_ESIM = "platform.view_esim"
REVEAL_CREDENTIALS = "platform.reveal_credentials"
VIEW_OPS = "platform.view_ops"
#: Retrying a supplier job re-enters the provisioning path and can spend wallet money, so it
#: is a write capability even though the queue it acts on is read with VIEW_OPS.
MANAGE_OPS = "platform.manage_ops"
MANAGE_CATALOG = "platform.manage_catalog"
MANAGE_PLATFORM_PRICING = "platform.manage_pricing"
MANAGE_SUPPORT = "platform.manage_support"
VIEW_AUDIT = "platform.view_audit"
VIEW_PLATFORM_REPORTS = "platform.view_reports"
MANAGE_ROLES = "platform.manage_roles"
MANAGE_SETTINGS = "platform.manage_settings"

_READ_ONLY = frozenset({
    VIEW_PLATFORM_DASHBOARD, VIEW_CUSTOMER, VIEW_ORDER, VIEW_ESIM, VIEW_OPS,
    VIEW_AUDIT, VIEW_PLATFORM_REPORTS,
})

PLATFORM_ROLE_CAPABILITIES = {
    # superuser is handled by a short-circuit in has_platform_capability, but the explicit
    # set keeps introspection and the matrix tests honest.
    "superuser": frozenset(
        _READ_ONLY | {
            MANAGE_AGENCY, MANAGE_ORDER, MANAGE_REFUND, MANAGE_COMMISSION,
            REVEAL_CREDENTIALS, MANAGE_CATALOG, MANAGE_PLATFORM_PRICING, MANAGE_SUPPORT,
            MANAGE_ROLES, MANAGE_SETTINGS, MANAGE_OPS,
        }
    ),
    "platform_admin": frozenset(
        _READ_ONLY | {
            MANAGE_AGENCY, MANAGE_ORDER, MANAGE_REFUND, MANAGE_COMMISSION,
            REVEAL_CREDENTIALS, MANAGE_CATALOG, MANAGE_PLATFORM_PRICING, MANAGE_SUPPORT,
            MANAGE_OPS,
        }
    ),
    # Support can help a customer but must not touch money or pricing.
    "support_admin": frozenset(
        _READ_ONLY | {MANAGE_ORDER, MANAGE_SUPPORT, REVEAL_CREDENTIALS}
    ),
    "finance_admin": frozenset(
        _READ_ONLY | {MANAGE_REFUND, MANAGE_COMMISSION}
    ),
    "readonly_admin": _READ_ONLY,
}


# --- Lookup helpers ------------------------------------------------------------------

def agency_capabilities(role):
    return AGENCY_ROLE_CAPABILITIES.get(role, frozenset())


def has_agency_capability(role, capability):
    return capability in agency_capabilities(role)


def platform_roles_for(user):
    """Resolve a user's platform roles from Django groups (+ the superuser flag)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    roles = set()
    if getattr(user, "is_superuser", False):
        roles.add("superuser")
    group_names = {name for name in user.groups.values_list("name", flat=True)}
    roles |= {name for name in group_names if name in PLATFORM_ROLE_CAPABILITIES}
    return frozenset(roles)


def has_platform_capability(user, capability):
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    for role in platform_roles_for(user):
        if capability in PLATFORM_ROLE_CAPABILITIES.get(role, frozenset()):
            return True
    return False


def check_role_definitions():
    """Assert the matrix is internally consistent. Called by the test suite."""
    assert set(AGENCY_ROLE_CAPABILITIES) == set(MEMBER_ROLES), (
        "AGENCY_ROLE_CAPABILITIES must cover exactly MEMBER_ROLES"
    )
    assert set(AGENCY_ROLE_RANK) == set(MEMBER_ROLES)
    for role, capabilities in AGENCY_ROLE_CAPABILITIES.items():
        leaked = capabilities & AGENCY_FORBIDDEN_CAPABILITIES
        assert not leaked, f"agency role {role!r} must never hold {sorted(leaked)}"
        assert all(c.startswith("agency.") for c in capabilities), role
    return True
