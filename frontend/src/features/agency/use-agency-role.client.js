"use client";
import { useEffect, useState } from "react";
import { fetchAgencyMembers, canManageAgency } from "@/lib/api/agency";
import { useSession } from "@/features/auth/use-session.client";

/**
 * The viewer's own role within an agency.
 *
 * `GET /organizations/` returns id, name, organization_type, status and
 * billing_email — but NOT the caller's role — so the only way to know it is to
 * match the signed-in email against the members roster.
 *
 * A hook rather than a wrapper component: passing a render function from a Server
 * Component into a Client Component is invalid in the App Router, since functions
 * don't cross that boundary.
 *
 * This gates affordances, not access — the server enforces the same rules and
 * answers 403 regardless of what is rendered.
 *
 * @returns {{myRole: string|null|undefined, canManage: boolean, error: any}}
 */
export function useAgencyRole(orgId) {
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const [myRole, setMyRole] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setMyRole(null);
      return;
    }
    let active = true;
    fetchAgencyMembers(orgId)
      .then((members) => {
        if (!active) return;
        setMyRole(members.find((m) => m.email === user.email)?.role || null);
      })
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [orgId, user]);

  return { myRole, canManage: canManageAgency(myRole), error };
}
