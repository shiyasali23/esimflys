from django.apps import AppConfig


class AdministrationConfig(AppConfig):
    """Cross-cutting administration concerns.

    Owns the immutable audit trail plus (in later phases) the platform and agency admin
    APIs. Kept separate from the business apps so that authorisation, tenancy and audit
    logic has exactly one home.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.administration"
    label = "administration"
