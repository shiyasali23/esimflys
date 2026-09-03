import site from "@/content/site.json";

/**
 * Validated social profile links, rendered only for profiles that actually exist.
 *
 * `content/site.json` carries a slot per network with `url: null` until a real profile is
 * created. Nothing renders for an empty slot, and `organizationJsonLd` applies the SAME
 * filter to `sameAs`, so the visible links and the structured data can never disagree.
 *
 * Why the validation below is not paranoia: `sameAs` is a primary input to entity
 * resolution. A dead, typo'd or http:// profile URL is worse than an absent one, because it
 * teaches Google something false about who this company is and there is no error to notice
 * — the page still renders and the build still passes. So a slot has to be a well-formed
 * https URL to count, and a malformed one is dropped exactly like an empty one.
 *
 * Icons are text labels, deliberately. lucide-react removed its brand icons upstream over
 * trademark concerns, and hand-redrawing the Instagram, X, TikTok or YouTube marks would be
 * both legally murky and visibly poor at 16px. To use the real marks, download each
 * platform's own brand kit, drop the SVGs in `public/icons/social/{key}.svg`, and render an
 * <img> beside the label — the `key` field is already there for exactly that.
 */
function isPublishable(profile) {
  // The try/catch below is the actual guard — `new URL(null)` throws and lands there, so
  // an empty slot is rejected either way. This early return is a fast path for the
  // common case (every slot is empty today), not a correctness requirement; removing it
  // changes no behaviour, which mutation testing confirmed.
  if (!profile?.url) return false;
  try {
    return new URL(profile.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Shared by the footer and by `sameAs`, so one rule governs both. */
export function publishableProfiles() {
  return (site.socialProfiles || []).filter(isPublishable);
}

export function SocialLinks({ className }) {
  const profiles = publishableProfiles();
  if (!profiles.length) return null;

  return (
    <nav aria-label="Social profiles" className={className}>
      <ul className="flex flex-wrap items-center gap-1">
        {profiles.map((p) => (
          <li key={p.key}>
            <a
              href={p.url}
              /*
                `rel="me"` states that this profile and this site are the same entity — the
                convention identity verifiers read. `noopener` because these open in a new
                tab; no `nofollow`, because these are our own profiles, not untrusted links.
              */
              rel="me noopener"
              target="_blank"
              className="inline-flex min-h-11 items-center px-2 text-body-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {p.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
