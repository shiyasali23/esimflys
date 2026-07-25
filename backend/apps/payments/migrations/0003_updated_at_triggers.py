from django.db import migrations

FORWARD = r"""
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END $$;
"""

REVERSE = r"""
DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    END LOOP;
END $$;
DROP FUNCTION IF EXISTS set_updated_at();
"""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_commissionpayout_partnercommission_and_more"),
        ("catalog", "0001_initial"),
        ("orders", "0001_initial"),
        ("payments", "0002_refund_refunditem_refund_refund_amount_positive_and_more"),
        ("esims", "0001_initial"),
    ]

    operations = [migrations.RunSQL(FORWARD, REVERSE)]
