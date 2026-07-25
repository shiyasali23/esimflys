from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Shared support package.

    Registered as an app so Django discovers its operational management commands
    (``reset_full``, ``reset_readonly``). It defines only abstract models, so it owns
    no database tables and generates no migrations.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    label = "common"
