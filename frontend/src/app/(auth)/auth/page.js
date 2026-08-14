import { redirect } from "next/navigation";
import { routes } from "@/config/routes";

/**
 * `/auth` used to render `AuthBento`, whose sign-in form was a stub:
 * `onSubmit={(e) => e.preventDefault()}` over uncontrolled inputs, so pressing the
 * button did nothing at all. The header linked here, which made it the app's primary
 * sign-in entry point.
 *
 * The working form lives at /auth/signin (AuthCard — it calls login()/register()), so
 * this route now just goes there. Kept rather than deleted because it is linked from
 * outside the app and from older emails.
 */
export default function AuthPage() {
  redirect(routes.signin());
}
