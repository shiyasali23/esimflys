"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Trash2, Plus, Info, KeyRound } from "lucide-react";
import {
  fetchAdminOrganization,
  fetchOrganizationMembers,
  addOrganizationMember,
  updateOrganizationMember,
  removeOrganizationMember,
  setMemberPassword,
  fetchOrganizationTrackingCodes,
  issueTrackingCode,
  allowedTransitions,
  transitionOrganization,
} from "@/lib/api/admin";
import { AGENCY_ROLES } from "@/lib/api/agency";
import { fieldErrors } from "@/lib/api/errors";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";

/**
 * One agency: profile, staff, tracking codes and lifecycle.
 *
 * Lifecycle is by action, never PATCH — `status` is read-only on the detail
 * serializer, so a field edit is accepted and discarded. Suspending requires a
 * reason. Illegal moves return 409 with a message naming the legal ones, which is
 * shown verbatim.
 *
 * Tracking codes carry NO discount — a database constraint forces it — so there
 * is no discount input here, only the commission rate in basis points.
 */
export function AdminAgencyDetail({ orgId }) {
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState(null);
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const focusReason = useFocusOnReveal();

  const load = useCallback(() => {
    fetchAdminOrganization(orgId).then(setOrg).catch(setError);
    fetchOrganizationMembers(orgId).then(setMembers).catch(() => setMembers([]));
    fetchOrganizationTrackingCodes(orgId).then(setCodes).catch(() => setCodes([]));
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(transition, withReason) {
    if (transition.requiresReason && !withReason) {
      setReasonFor(transition);
      setReason("");
      return;
    }
    setBusy("lifecycle");
    setNotice(null);
    try {
      await transitionOrganization(orgId, transition.verb, { reason: withReason });
      setReasonFor(null);
      load();
    } catch (err) {
      setNotice(err?.message || "That change wasn't accepted.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="Agency not found"
        body="No organization matches that reference."
        action={{ label: "Back to agencies", href: `${routes.admin()}/agencies` }}
      />
    ) : (
      <ErrorState error={error} title="We couldn't load this agency" />
    );
  }

  if (!org) {
    return (
      <div className="min-h-[22rem] space-y-3" aria-busy="true">
        <div className="h-28 animate-pulse rounded-card bg-muted" />
        <div className="h-48 animate-pulse rounded-card bg-muted" />
      </div>
    );
  }

  const moves = allowedTransitions(org.status);

  return (
    <div className="space-y-6">
      <Link
        href={`${routes.admin()}/agencies`}
        className="inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> All agencies
      </Link>

      {notice ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      <section className="rounded-card border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-foreground">{org.name}</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {org.billing_email}
              {org.country ? ` · ${org.country}` : ""}
              {` · ${org.member_count} member${org.member_count === 1 ? "" : "s"}`}
            </p>
            {org.suspension_reason ? (
              <p className="mt-1 text-body-sm text-destructive">{org.suspension_reason}</p>
            ) : null}
          </div>
          <StatusBadge status={org.status} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
          {moves.length ? (
            moves.map((transition) => (
              <button
                key={transition.verb}
                type="button"
                disabled={busy === "lifecycle"}
                onClick={() => act(transition)}
                className="rounded-full border border-border px-4 py-2 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
              >
                {transition.verb}
              </button>
            ))
          ) : (
            <p className="text-body-sm text-muted-foreground">
              This agency is closed — no further lifecycle changes are possible.
            </p>
          )}
        </div>

        {reasonFor ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(reasonFor, reason.trim());
            }}
            className="mt-4 rounded-md border border-border bg-muted p-4"
          >
            <p id="suspend-consequence" className="mb-3 text-body-sm text-foreground">
              Suspending stops commission on new sales. The reason is recorded in the audit trail.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-56 flex-1">
                <span className="mb-1 block text-label-bold text-foreground">Reason</span>
                <input
                  ref={focusReason}
                  type="text"
                  required
                  value={reason}
                  aria-describedby="suspend-consequence"
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. fraud review"
                  className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-destructive px-5 py-2.5 text-label-bold text-destructive-foreground hover:brightness-110"
              >
                Confirm suspend
              </button>
              <button
                type="button"
                onClick={() => setReasonFor(null)}
                className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <MembersSection orgId={orgId} members={members} onChanged={load} setNotice={setNotice} />
      <CodesSection orgId={orgId} codes={codes} onChanged={load} setNotice={setNotice} />
    </div>
  );
}

function MembersSection({ orgId, members, onChanged, setNotice }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({});
  const [pwFor, setPwFor] = useState(null);

  /**
   * The platform issues agency credentials and nothing else can: agencies have no
   * signup, no Google login, and a password-reset request for an agency address
   * returns the normal success message while silently doing nothing (contract §7).
   * Without this, a member who forgets their password is simply locked out.
   */
  async function resetPassword(event, member) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const password = String(new FormData(formEl).get("password") || "");
    setBusyId(member.id);
    setNotice(null);
    try {
      await setMemberPassword(orgId, member.id, password);
      setPwFor(null);
      setNotice(`Password set for ${member.email}. Send it to them over a channel you trust.`);
    } catch (err) {
      const fields = fieldErrors(err);
      setNotice(fields.password || err?.message || "We couldn't set that password.");
    } finally {
      setBusyId(null);
    }
  }

  async function add(event) {
    event.preventDefault();
    setErrors({});
    setNotice(null);
    setBusyId("new");
    try {
      await addOrganizationMember(orgId, { email: email.trim(), role });
      setEmail("");
      onChanged();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else if (err?.status === 404) {
        setNotice("That person needs an eSIMFlys account before they can be added.");
      } else setNotice(err?.message || "We couldn't add that person.");
    } finally {
      setBusyId(null);
    }
  }

  async function change(member, patch) {
    setBusyId(member.id);
    setNotice(null);
    try {
      await updateOrganizationMember(orgId, member.id, patch);
      onChanged();
    } catch (err) {
      // 409 last_owner_protected explains itself — an agency must keep an owner.
      setNotice(err?.message || "We couldn't update that member.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member) {
    setBusyId(member.id);
    setNotice(null);
    try {
      await removeOrganizationMember(orgId, member.id);
      onChanged();
    } catch (err) {
      setNotice(err?.message || "We couldn't remove that member.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-card border border-border bg-white p-6">
      <h3 className="mb-4 font-display text-headline-md text-foreground">
        Staff ({members?.length ?? 0})
      </h3>

      <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3" noValidate>
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Email address</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@agency.com"
            className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-label-bold text-foreground">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2.5 text-body-sm text-foreground"
          >
            {AGENCY_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busyId === "new"}
          className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
        >
          <UserPlus size={16} aria-hidden /> {busyId === "new" ? "Adding…" : "Add"}
        </button>
      </form>
      {errors.email ? (
        <p role="alert" className="mb-4 text-body-sm text-destructive">{errors.email}</p>
      ) : null}

      {!members?.length ? (
        <p className="text-body-sm text-muted-foreground">No staff yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const name = [member.first_name, member.last_name].filter(Boolean).join(" ");
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{name || member.email}</p>
                  {name ? (
                    <p className="text-body-sm text-muted-foreground">{member.email}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={member.status} />
                  <select
                    value={member.role}
                    disabled={busyId === member.id}
                    aria-label={`Role for ${member.email}`}
                    onChange={(e) => change(member, { role: e.target.value })}
                    className="rounded-md border border-border bg-white px-3 py-1.5 text-body-sm text-foreground disabled:opacity-60"
                  >
                    {AGENCY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPwFor(pwFor === member.id ? null : member.id)}
                    disabled={busyId === member.id}
                    aria-label={`Set password for ${member.email}`}
                    className="text-muted-foreground hover:text-primary disabled:opacity-50"
                  >
                    <KeyRound size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(member)}
                    disabled={busyId === member.id}
                    aria-label={`Remove ${member.email}`}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>

                {pwFor === member.id ? (
                  <form
                    onSubmit={(e) => resetPassword(e, member)}
                    className="mt-3 w-full rounded-md border border-border bg-muted p-4"
                    noValidate
                  >
                    <p id={`pw-note-${member.id}`} className="mb-3 text-body-sm text-foreground">
                      This is the only way {member.email} gets a password — agencies cannot reset
                      their own. Nothing is emailed; send it over a channel you trust.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-56 flex-1">
                        <span className="mb-1 block text-label-bold text-foreground">
                          New password
                        </span>
                        <input
                          name="password"
                          type="text"
                          required
                          autoComplete="off"
                          aria-describedby={`pw-note-${member.id}`}
                          className="w-full rounded-md border border-border bg-white px-4 py-2.5 font-mono text-body-sm outline-none focus:border-primary"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busyId === member.id}
                        className="rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
                      >
                        {busyId === member.id ? "Setting…" : "Set password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPwFor(null)}
                        className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CodesSection({ orgId, codes, onChanged, setNotice }) {
  const [code, setCode] = useState("");
  const [bps, setBps] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  async function issue(event) {
    event.preventDefault();
    setErrors({});
    setNotice(null);
    setBusy(true);
    try {
      await issueTrackingCode(orgId, { code: code.trim().toUpperCase(), commissionBps: Number(bps) });
      setCode("");
      onChanged();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setNotice(err?.message || "We couldn't issue that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-white p-6">
      <h3 className="mb-4 font-display text-headline-md text-foreground">
        Tracking codes ({codes?.length ?? 0})
      </h3>

      <div className="mb-6 flex gap-3 rounded-md border border-border bg-muted p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-body-sm text-muted-foreground">
          A tracking code carries <strong className="text-foreground">no discount</strong> — the
          customer pays full price. It attributes the sale so the agency earns commission.
        </p>
      </div>

      <form onSubmit={issue} className="mb-6 flex flex-wrap items-end gap-3" noValidate>
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Code</span>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SUNRISE20"
            className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm uppercase outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-label-bold text-foreground">Commission (bps)</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={bps}
            onChange={(e) => setBps(e.target.value)}
            className="w-32 rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
        >
          <Plus size={16} aria-hidden /> {busy ? "Issuing…" : "Issue code"}
        </button>
      </form>
      {errors.code ? (
        <p role="alert" className="mb-4 text-body-sm text-destructive">{errors.code}</p>
      ) : null}
      <p className="mb-6 text-body-sm text-muted-foreground">
        2000 bps = 20%. Must be between 1 and 10000.
      </p>

      {!codes?.length ? (
        <p className="text-body-sm text-muted-foreground">No codes issued yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {codes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <code className="font-display text-lg tracking-wide text-foreground">{c.code}</code>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {c.commission_type === "percentage_bps" && c.commission_value != null
                    ? `${(c.commission_value / 100).toFixed(2)}%`
                    : "Rate set per code"}
                  {` · ${c.redemption_count ?? 0} use${c.redemption_count === 1 ? "" : "s"}`}
                  {c.usage_limit ? ` of ${c.usage_limit}` : ""}
                </p>
              </div>
              <StatusBadge status={c.is_active ? "active" : "disabled"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
