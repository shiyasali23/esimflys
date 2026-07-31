"use client";
import { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import {
  fetchAgencyMembers,
  addAgencyMember,
  updateAgencyMember,
  removeAgencyMember,
  assignableRoles,
} from "@/lib/api/agency";
import { fieldErrors } from "@/lib/api/errors";
import { useAgencyRole } from "@/features/agency/use-agency-role.client";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Agency staff.
 *
 * Two server rules drive the UI:
 *  - A member may only grant roles STRICTLY BELOW their own, so the role options
 *    are derived from the viewer's role rather than hard-coded.
 *  - The last active owner cannot be demoted, disabled or removed — the server
 *    answers `409 last_owner_protected`, which is surfaced verbatim rather than
 *    hidden, because the user needs to know why the action refused.
 *
 * Plain array, not paginated.
 */
export function AgencyStaff({ orgId }) {
  const { myRole, canManage } = useAgencyRole(orgId);
  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});

  const options = assignableRoles(myRole);

  const reload = useCallback(() => {
    fetchAgencyMembers(orgId).then(setMembers).catch(setLoadError);
  }, [orgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!role && options.length) setRole(options[options.length - 1]);
  }, [role, options]);

  async function invite(event) {
    event.preventDefault();
    setErrors({});
    setNotice(null);
    setBusyId("new");
    try {
      await addAgencyMember(orgId, { email: email.trim(), role });
      setEmail("");
      reload();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.status === 404) {
        setNotice("That person needs an eSIMFlys account before they can be added.");
      } else {
        setNotice(error?.message || "We couldn't add that person.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function change(member, patch) {
    setNotice(null);
    setBusyId(member.id);
    try {
      await updateAgencyMember(orgId, member.id, patch);
      reload();
    } catch (error) {
      setNotice(error?.message || "We couldn't update that member.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member) {
    setNotice(null);
    setBusyId(member.id);
    try {
      await removeAgencyMember(orgId, member.id);
      reload();
    } catch (error) {
      setNotice(error?.message || "We couldn't remove that member.");
    } finally {
      setBusyId(null);
    }
  }

  if (loadError) return <ErrorState error={loadError} title="We couldn't load your staff" />;
  if (!members) return <div className="h-64 animate-pulse rounded-card bg-muted" aria-busy="true" />;

  return (
    <div>
      {canManage && options.length ? (
        <form
          onSubmit={invite}
          className="mb-6 rounded-card border border-border bg-white p-6"
          noValidate
        >
          <h3 className="mb-4 font-display text-headline-md text-foreground">Add a colleague</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-label-bold text-foreground">Email address</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@agency.com"
                className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-label-bold text-foreground">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-border bg-white px-3 py-3 text-body-md text-foreground"
              >
                {options.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busyId === "new"}
              className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-3 text-label-bold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
            >
              <UserPlus size={16} aria-hidden /> {busyId === "new" ? "Adding…" : "Add"}
            </button>
          </div>
          {errors.email ? (
            <p role="alert" className="mt-2 text-body-sm text-destructive">{errors.email}</p>
          ) : null}
          <p className="mt-3 text-body-sm text-muted-foreground">
            You can grant roles below your own ({myRole}). They must already have an account.
          </p>
        </form>
      ) : null}

      {notice ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      {!members.length ? (
        <EmptyState title="No staff yet" body="Add colleagues so they can see your reporting." />
      ) : (
        <ul className="space-y-3">
          {members.map((member) => {
            const name = [member.first_name, member.last_name].filter(Boolean).join(" ");
            const editable = canManage && options.includes(member.role);
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-white p-5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{name || member.email}</p>
                  {name ? (
                    <p className="text-body-sm text-muted-foreground">{member.email}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={member.status} />
                  {editable ? (
                    <select
                      value={member.role}
                      disabled={busyId === member.id}
                      onChange={(e) => change(member, { role: e.target.value })}
                      aria-label={`Role for ${member.email}`}
                      className="rounded-md border border-border bg-white px-3 py-2 text-body-sm text-foreground disabled:opacity-60"
                    >
                      {[member.role, ...options.filter((r) => r !== member.role)].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-body-sm text-muted-foreground">{member.role}</span>
                  )}
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => remove(member)}
                      disabled={busyId === member.id}
                      aria-label={`Remove ${member.email}`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
