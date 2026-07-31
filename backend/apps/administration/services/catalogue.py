"""Catalogue management.

Activating a plan is the moment it becomes sellable, and editing a price changes what
customers are charged — both are money-affecting actions, so both run through this module
where they are validated and audited rather than being bare field writes.

The import command remains the source of truth for *what exists*; these services control
*what is on sale* and *at what price*.
"""

from django.db import transaction

from apps.administration.audit import diff as audit_diff
from apps.administration.audit import model_snapshot, record_audit
from apps.catalog.models import CatalogPlan, Country, TopupProduct
from apps.common.exceptions import Conflict

#: A retired product has been withdrawn by the supplier; it must be re-imported, not
#: flipped back on by hand.
SELLABLE_FROM_STATES = ("draft", "paused")
PLAN_ADMIN_STATES = ("draft", "paused", "active")


class PlanNotActivatable(Conflict):
    error_code = "plan_not_activatable"
    default_message = "This plan cannot be activated."


def _set_plan_status(plan, status, *, actor=None, request=None):
    if status not in PLAN_ADMIN_STATES:
        raise PlanNotActivatable(message=f"'{status}' is not a settable plan status.")
    if plan.status == "retired":
        raise PlanNotActivatable(
            message="Retired plans cannot be changed. Re-import the catalogue instead."
        )
    if status == "active" and plan.status not in SELLABLE_FROM_STATES:
        raise PlanNotActivatable(
            message=f"A plan in state '{plan.status}' cannot be activated."
        )

    previous = plan.status
    if previous == status:
        return plan
    plan.status = status
    plan.save(update_fields=["status", "updated_at"])
    record_audit(
        action=f"catalog_plan.{'activated' if status == 'active' else status}",
        actor=actor,
        obj=plan,
        changes={"status": [previous, status]},
        context={
            "product_code": plan.product_code,
            "country": plan.country.iso2,
            "retail_amount_minor": plan.retail_amount_minor,
        },
        request=request,
    )
    return plan


def set_plan_status(plan, status, *, actor=None, request=None):
    with transaction.atomic():
        plan = CatalogPlan.objects.select_for_update().select_related("country").get(pk=plan.pk)
        return _set_plan_status(plan, status, actor=actor, request=request)


def bulk_set_plan_status(plan_ids, status, *, actor=None, request=None):
    """Apply a status to many plans, reporting per-plan failures instead of aborting."""
    updated, failed = [], []
    for plan_id in plan_ids:
        plan = CatalogPlan.objects.filter(pk=plan_id).select_related("country").first()
        if plan is None:
            failed.append({"id": str(plan_id), "error": "not found"})
            continue
        try:
            set_plan_status(plan, status, actor=actor, request=request)
            updated.append(str(plan_id))
        except Conflict as exc:
            failed.append({"id": str(plan_id), "error": exc.message})
    return {"updated": updated, "failed": failed, "status": status}


def activate_country_plans(country, *, actor=None, request=None):
    """Turn on every sellable plan for one country — the usual go-live action."""
    plan_ids = list(
        CatalogPlan.objects.filter(
            country=country, status__in=SELLABLE_FROM_STATES
        ).values_list("id", flat=True)
    )
    return bulk_set_plan_status(plan_ids, "active", actor=actor, request=request)


def update_plan(plan, data, *, actor=None, request=None):
    """Apply an audited field update to a plan (price, badge, ordering, default).

    Status is intentionally not settable here — it goes through :func:`set_plan_status`
    so activation always passes the state guards.
    """
    with transaction.atomic():
        plan = CatalogPlan.objects.select_for_update().select_related("country").get(pk=plan.pk)
        if plan.status == "retired":
            raise PlanNotActivatable(message="Retired plans cannot be edited.")

        before = model_snapshot(plan)
        for field, value in data.items():
            setattr(plan, field, value)
        plan.save()
        changes = audit_diff(before, model_snapshot(plan))
        if changes:
            record_audit(
                action="catalog_plan.updated",
                actor=actor, obj=plan, changes=changes,
                context={"product_code": plan.product_code},
                request=request,
            )
        return plan


def update_country(country, data, *, actor=None, request=None):
    with transaction.atomic():
        country = Country.objects.select_for_update().get(pk=country.pk)
        before = model_snapshot(country)
        for field, value in data.items():
            setattr(country, field, value)
        country.save()
        changes = audit_diff(before, model_snapshot(country))
        if changes:
            record_audit(
                action="country.updated",
                actor=actor, obj=country, changes=changes,
                context={"iso2": country.iso2}, request=request,
            )
        return country


def update_topup_product(product, data, *, actor=None, request=None):
    with transaction.atomic():
        product = TopupProduct.objects.select_for_update().get(pk=product.pk)
        before = model_snapshot(product)
        for field, value in data.items():
            setattr(product, field, value)
        product.save()
        changes = audit_diff(before, model_snapshot(product))
        if changes:
            record_audit(
                action="topup_product.updated",
                actor=actor, obj=product, changes=changes,
                context={"product_code": product.product_code}, request=request,
            )
        return product


def import_catalogue(*, actor=None, request=None, path=None):
    """Re-import the supplier workbook. Never activates anything by itself."""
    from django.core.management import call_command

    options = {"path": str(path)} if path else {}
    call_command("import_catalog", verbosity=0, **options)
    counts = {
        "countries": Country.objects.count(),
        "plans": CatalogPlan.objects.count(),
        "active_plans": CatalogPlan.objects.filter(status="active").count(),
    }
    record_audit(
        action="catalog.imported", actor=actor, context=counts, request=request
    )
    return counts
