import { Link2Off } from "lucide-react";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * Shown when a detail page is opened without the record id it needs.
 *
 * The authenticated detail screens take their id from `?id=` rather than a path
 * segment (see `config/routes.js` for why). That makes a missing or hand-truncated
 * query string a reachable state — `/account/orders/detail` with nothing after it —
 * where previously the router would simply not have matched. Without this guard the
 * id reaches the fetch as `null` and the page asks the API for a record called
 * "null", which surfaces as a generic error rather than the actual problem.
 */
export function MissingReference({ backHref, backLabel = "Back" }) {
  return (
    <Container className="py-16">
      <EmptyState
        icon={Link2Off}
        title="Nothing to show"
        body="This link is missing the record it should open. Open it again from the list."
        action={{ label: backLabel, href: backHref }}
      />
    </Container>
  );
}
