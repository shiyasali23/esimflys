"""Shared plumbing for reset commands.

Named with a leading underscore so Django's command discovery ignores it — this module
holds a base class, not a runnable command.
"""

import logging
import sys

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger("apps.common.reset")

EXIT_ABORTED = 3
EXIT_VALIDATION_FAILED = 4


class BaseResetCommand(BaseCommand):
    """Base command providing step banners, logging and destructive-operation guards."""

    total_steps = 0

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._step_number = 0

    def log(self, message, level="info"):
        """Emit a progress message to both stdout and the application logger."""
        getattr(logger, level, logger.info)(message)
        style = {
            "info": lambda text: text,
            "warning": self.style.WARNING,
            "error": self.style.ERROR,
            "success": self.style.SUCCESS,
        }.get(level, lambda text: text)
        self.stdout.write("    " + style(str(message)))

    def step(self, title):
        """Print a numbered step banner."""
        self._step_number += 1
        self.stdout.write(
            self.style.MIGRATE_HEADING(f"\n[{self._step_number}/{self.total_steps}] {title}")
        )

    def guard_environment(self, force):
        """Refuse destructive operations against a non-DEBUG (production) database."""
        if not settings.DEBUG and not force:
            raise CommandError(
                "Refusing to run a destructive reset with DEBUG=False. This looks like a "
                "production environment. Re-run with --force if you are certain.",
                returncode=EXIT_ABORTED,
            )

    def confirm_destructive(self, noinput):
        """Require explicit confirmation before deleting data."""
        if noinput:
            return
        if not sys.stdin.isatty():
            raise CommandError(
                "Refusing to delete data without confirmation in a non-interactive shell. "
                "Re-run with --noinput to proceed.",
                returncode=EXIT_ABORTED,
            )
        database = settings.DATABASES["default"].get("NAME", "<unknown>")
        answer = input(f"This will DELETE ALL DATA in '{database}'. Type 'yes' to continue: ")
        if answer.strip().lower() != "yes":
            raise CommandError("Aborted by user.", returncode=EXIT_ABORTED)

    def fail_on_validation(self, report):
        """Raise when the post-import validation found problems."""
        problems = report.get("problems") or []
        if not problems:
            self.log("validation passed", "success")
            return
        for problem in problems:
            self.log(f"validation problem: {problem}", "error")
        raise CommandError(
            f"Reference data validation failed with {len(problems)} problem(s).",
            returncode=EXIT_VALIDATION_FAILED,
        )
