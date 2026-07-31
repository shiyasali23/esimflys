"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { fetchAgencyProfile, updateAgencyProfile } from "@/lib/api/agency";
import { useAgencyRole } from "@/features/agency/use-agency-role.client";
import { fieldErrors } from "@/lib/api/errors";
import { StatusBadge } from "@/components/data/status-badge";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Agency profile.
 *
 * Only name, billing email, support email and country are writable. `status` and
 * the commission fields are read-only server-side — sending them is accepted and
 * silently discarded, verified against the running server — so they are rendered
 * as disabled facts rather than inputs. An editable-looking field that throws the
 * value away is worse than no field.
 */
export function AgencyProfile({ orgId }) {
  const { canManage: canEdit } = useAgencyRole(orgId);
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ name: "", billingEmail: "", supportEmail: "", country: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAgencyProfile(orgId)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setForm({
          name: result.name || "",
          billingEmail: result.billing_email || "",
          supportEmail: result.support_email || "",
          country: result.country || "",
        });
      })
      .catch((err) => active && setLoadError(err));
    return () => {
      active = false;
    };
  }, [orgId]);

  async function save(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);
    setSaving(true);
    try {
      setProfile(await updateAgencyProfile(orgId, form));
      setSaved(true);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.status === 403) setFormError("Your role can't change these details.");
      else setFormError(error?.message || "We couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <ErrorState error={loadError} title="We couldn't load your profile" />;
  if (!profile) return <div className="h-72 animate-pulse rounded-card bg-muted" aria-busy="true" />;

  const field = (key, label, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-label-bold text-foreground">{label}</span>
      <input
        type={type}
        value={form[key]}
        disabled={!canEdit}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary disabled:opacity-60"
      />
      {errors[key === "billingEmail" ? "billing_email" : key === "supportEmail" ? "support_email" : key] ? (
        <span role="alert" className="mt-1 block text-body-sm text-destructive">
          {errors[key === "billingEmail" ? "billing_email" : key === "supportEmail" ? "support_email" : key]}
        </span>
      ) : null}
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={save} className="rounded-card border border-border bg-white p-6" noValidate>
        <h3 className="mb-6 font-display text-headline-md text-foreground">Your details</h3>
        <div className="space-y-4">
          {field("name", "Agency name")}
          {field("billingEmail", "Billing email", "email")}
          {field("supportEmail", "Support email", "email")}
          {field("country", "Country (ISO-2)")}
        </div>
        {canEdit ? (
          <>
            <button
              type="submit"
              disabled={saving}
              className="mt-6 rounded-full bg-cta px-6 py-3 text-label-bold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved ? (
              <p role="status" className="mt-3 text-body-sm text-success-text">
                Your details were saved.
              </p>
            ) : null}
            {formError ? (
              <p role="alert" className="mt-3 text-body-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-6 text-body-sm text-muted-foreground">
            Only an owner or admin can change these details.
          </p>
        )}
      </form>

      <div className="rounded-card border border-border bg-white p-6">
        <h3 className="mb-6 flex items-center gap-2 font-display text-headline-md text-foreground">
          <Lock size={16} className="text-muted-foreground" aria-hidden /> Set by the platform
        </h3>
        <dl className="space-y-4 text-body-md">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Account status</dt>
            <dd>
              <StatusBadge status={profile.status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Commission rate</dt>
            <dd className="font-medium text-foreground">
              {profile.default_commission_type === "percentage_bps" &&
              profile.default_commission_value != null
                ? `${(profile.default_commission_value / 100).toFixed(2)}%`
                : "Per tracking code"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Organization type</dt>
            <dd className="font-medium text-foreground">
              {String(profile.organization_type || "").replace(/_/g, " ")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Partner since</dt>
            <dd className="font-medium text-foreground">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-body-sm text-muted-foreground">
          These are managed by eSIMFlys. Contact your account manager to change them.
        </p>
      </div>
    </div>
  );
}
