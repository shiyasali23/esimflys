"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency } from "@/features/agency/use-agency.client";

/** Sign-out for the partner portal. Renders nothing until there is a session to end. */
export function AgencySignOut() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const signOut = useSession((s) => s.signOut);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (!user) return null;

  return (
    <div className="flex items-center gap-4">
      <span className="hidden text-body-sm text-muted-foreground sm:inline">{user.email}</span>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          // The next account signing in must not inherit these memberships.
          useAgency.getState().reset();
          router.replace("/agency");
        }}
        className="rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted"
      >
        Sign out
      </button>
    </div>
  );
}
