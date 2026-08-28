"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSession } from "@/features/auth/use-session.client";

/**
 * Who is signed in, and the way out.
 *
 * Removing the storefront header took sign-out with it — that button lived in the
 * customer account menu, and both panels inherited it by accident rather than by
 * design. Losing it would leave an operator on a shared machine with no way to end a
 * session that can issue refunds.
 *
 * `onSignedOut` lets the agency portal clear its cached memberships in the same act,
 * so the next account to sign in on this browser cannot inherit the previous tenant's
 * organization list.
 */
export function AdminAccountMenu({ onSignedOut, redirectTo = "/" }) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-52 truncate text-admin-label text-admin-text-muted md:inline">
        {user.email}
      </span>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          onSignedOut?.();
          router.replace(redirectTo);
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-admin-sm border border-admin-border px-2.5 text-admin-label text-admin-text transition-colors hover:bg-admin-hover"
      >
        <LogOut size={14} aria-hidden />
        Sign out
      </button>
    </div>
  );
}
