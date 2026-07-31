import json

from django.test import TestCase, override_settings

from apps.accounts.models import Organization, User
from apps.administration import audit
from apps.administration.models import AuditEvent
from apps.catalog.models import CatalogPlan, Country, Supplier
from apps.esims import services as esim_services
from apps.esims.models import EsimProfile
from apps.orders import services as order_services


class RedactionTests(TestCase):
    def test_sensitive_names_are_detected(self):
        for name in (
            "password", "iccid", "iccid_encrypted", "activation_code", "qr_payload",
            "smdp_address_encrypted", "api_key", "client_secret", "guest_token_hash",
            "Authorization", "STRIPE_SECRET_KEY",
        ):
            self.assertTrue(audit.is_sensitive(name), name)

    def test_ordinary_names_are_not_redacted(self):
        for name in ("email", "status", "amount_minor", "order_number", "country_iso2"):
            self.assertFalse(audit.is_sensitive(name), name)

    def test_raw_bytes_are_never_stored_even_under_a_safe_name(self):
        cleaned = audit.redact({"harmless": b"\x00\x01secret-bytes"})
        self.assertEqual(cleaned["harmless"], audit.REDACTED)

    def test_nested_structures_are_redacted(self):
        cleaned = audit.redact(
            {"outer": {"activation_code": "ABC123", "keep": "visible"},
             "list": [{"qr_payload": "LPA:1$x$y"}]}
        )
        self.assertEqual(cleaned["outer"]["activation_code"], audit.REDACTED)
        self.assertEqual(cleaned["outer"]["keep"], "visible")
        self.assertEqual(cleaned["list"][0]["qr_payload"], audit.REDACTED)

    def test_long_values_are_truncated(self):
        cleaned = audit.redact({"note": "x" * (audit.MAX_VALUE_LENGTH + 50)})
        self.assertLessEqual(len(cleaned["note"]), audit.MAX_VALUE_LENGTH + 1)

    def test_diff_drops_fields_redacted_on_both_sides(self):
        changed = audit.diff(
            {"iccid": audit.REDACTED, "status": "pending"},
            {"iccid": audit.REDACTED, "status": "ready"},
        )
        self.assertEqual(changed, {"status": ["pending", "ready"]})


@override_settings(SUPPLIER_GATEWAY="fake")
class EsimCredentialLeakTests(TestCase):
    """The highest-risk audit scenario: snapshotting a provisioned eSIM profile."""

    def setUp(self):
        supplier = Supplier.objects.create(code="esim-access", name="eSIM Access", status="active")
        country = Country.objects.create(
            iso2="FR", name="France", slug="france", region="Europe", is_active=True
        )
        CatalogPlan.objects.create(
            supplier=supplier, country=country, product_code="FR-5GB-30D",
            supplier_package_code="PKG", plan_type="fixed", display_name="FR 5GB",
            data_limit_mb=5000, validity_days=30, retail_amount_minor=1500,
            currency="USD", status="active",
        )
        cart, _ = order_services.create_cart(user=None)
        order_services.add_item(cart, product_code="FR-5GB-30D", quantity=1)
        order = order_services.checkout(cart_id=cart.id, customer_email="a@b.com")
        esim_services.enqueue_provisioning_for_order(order)
        while esim_services.claim_and_process_one():
            pass
        self.profile = EsimProfile.objects.get(order_item__order=order)
        self.credentials = esim_services.decrypt_credentials(self.profile)

    def test_model_snapshot_of_esim_contains_no_plaintext_secret(self):
        snapshot = audit.model_snapshot(self.profile)
        blob = json.dumps(snapshot)
        for secret in self.credentials.values():
            self.assertNotIn(secret, blob)
        self.assertEqual(snapshot["iccid_encrypted"], audit.REDACTED)
        self.assertEqual(snapshot["qr_payload_encrypted"], audit.REDACTED)
        # Non-secret operational fields survive so the audit stays useful.
        self.assertEqual(snapshot["status"], "ready")

    def test_recorded_event_never_persists_a_secret(self):
        audit.record_audit(
            action="esim.inspected",
            obj=self.profile,
            changes=audit.model_snapshot(self.profile),
            context={"activation_code": self.credentials["activation_code"]},
        )
        event = AuditEvent.objects.get(action="esim.inspected")
        blob = json.dumps({"c": event.changes, "x": event.context, "r": event.object_repr})
        for secret in self.credentials.values():
            self.assertNotIn(secret, blob)


class RecordAuditTests(TestCase):
    def test_actor_email_is_denormalised_and_survives_user_deletion(self):
        user = User.objects.create_user(email="actor@example.com", password="pw-123456789")
        audit.record_audit(action="thing.done", actor=user)
        user.delete()
        event = AuditEvent.objects.get(action="thing.done")
        self.assertIsNone(event.actor_id)
        self.assertEqual(event.actor_email, "actor@example.com")

    def test_actor_type_inferred(self):
        staff = User.objects.create_user(
            email="staff@example.com", password="pw-123456789", is_staff=True
        )
        customer = User.objects.create_user(email="cust@example.com", password="pw-123456789")
        org = Organization.objects.create(
            name="A", organization_type="travel_agency", billing_email="a@a.com", status="active"
        )
        self.assertEqual(audit.record_audit(action="a", actor=staff).actor_type, "platform")
        self.assertEqual(audit.record_audit(action="b", actor=customer).actor_type, "customer")
        self.assertEqual(
            audit.record_audit(action="c", actor=customer, organization=org).actor_type, "agency"
        )
        self.assertEqual(audit.record_audit(action="d").actor_type, "system")

    def test_audit_row_is_written_in_the_callers_transaction(self):
        """A failed action must not leave an orphaned audit row."""
        from django.db import transaction

        try:
            with transaction.atomic():
                audit.record_audit(action="will.rollback")
                raise RuntimeError("business failure")
        except RuntimeError:
            pass
        self.assertFalse(AuditEvent.objects.filter(action="will.rollback").exists())
