from django.db import migrations

REFRESH = r"""
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


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_commissionpayout_partnercommission_and_more"),
        ("catalog", "0002_topupproduct"),
        ("orders", "0003_remove_cartitem_cart_item_type_valid_and_more"),
        ("payments", "0003_updated_at_triggers"),
        ("esims", "0002_topupfulfillment"),
    ]

    operations = [migrations.RunSQL(REFRESH, migrations.RunSQL.noop)]
