"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Smartphone, Receipt, LogOut } from "lucide-react";
import { updateMe } from "@/lib/api/session";
import { useSession } from "@/features/auth/use-session.client";
import { fieldErrors } from "@/lib/api/errors";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * Account profile. Email is not editable here — the backend exposes only name and
 * preferred currency on `PATCH /account/me/`, so an email field would silently
 * discard what the user typed.
 */
export function ProfileView() {
  const router = useRouter();
  const { user, load, setUser, signOut } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
    }
  }, [user]);

  async function handleSave(event) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);
    setSaving(true);
    try {
      setUser(await updateMe({ firstName, lastName }));
      setSaved(true);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(error?.message || "We couldn't save your details.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * signOut clears local state in a `finally` and then rethrows if the server call
   * failed, so this tab is signed out either way.
   *
   * On failure we deliberately do NOT navigate: leaving the user here is what makes
   * the warning readable. A logout that never reached the server may have left the
   * session cookie alive, and bouncing to the homepage would hide that.
   */
  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      setFormError(
        "We signed you out on this device, but couldn't reach the server. Close your browser to be safe.",
      );
      return;
    }
    router.push(routes.home());
    router.refresh();
  }

  if (user === undefined) {
    return (
      <Container className="py-16">
        <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (user === null) {
    return (
      <Container className="py-16">
        {/* `signOut` clears local state in a `finally`, so a FAILED sign-out still
            lands here — and this branch used to drop the warning it had just set,
            leaving the one message about a possibly-live server session invisible. */}
        {formError ? (
          <p
            role="alert"
            className="mx-auto mb-6 max-w-md rounded-md bg-destructive/10 p-3 text-center text-body-sm text-destructive-text"
          >
            {formError}
          </p>
        ) : null}
        <EmptyState
          title="Sign in to your account"
          body="Manage your details and see the eSIMs you've bought."
          action={{ label: "Sign in", href: routes.signin() }}
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-12">
      <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">Your account</h1>
      <p className="mb-8 text-body-md text-muted-foreground">{user.email}</p>

      <form onSubmit={handleSave} className="rounded-card border border-border bg-white p-8" noValidate>
        <h2 className="mb-6 font-display text-headline-md text-foreground">Your details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">First name</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">Last name</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              className="w-full rounded-sm border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
          </label>
        </div>
        {errors.first_name || errors.last_name ? (
          <p role="alert" className="mt-2 text-body-sm text-destructive">
            {errors.first_name || errors.last_name}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-full bg-cta px-6 py-3 text-label-bold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved ? (
          <p role="status" className="mt-3 text-body-sm text-success-text">Your details were saved.</p>
        ) : null}
        {formError ? (
          <p role="alert" className="mt-3 text-body-sm text-destructive">{formError}</p>
        ) : null}
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-white p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Link
            href={routes.accountEsims()}
            className="inline-flex items-center gap-2 text-label-bold text-primary hover:underline"
          >
            <Smartphone size={16} aria-hidden /> My eSIMs
          </Link>
          <Link
            href={routes.accountOrders()}
            className="inline-flex items-center gap-2 text-label-bold text-primary hover:underline"
          >
            <Receipt size={16} aria-hidden /> Your orders
          </Link>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          <LogOut size={16} aria-hidden /> Sign out
        </button>
      </div>
    </Container>
  );
}
