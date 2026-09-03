import site from "@/content/site.json";
import { SocialMark } from "@/components/media/social-marks";

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
 * Icons are the platforms' own glyphs, from `media/social-marks`, keyed on the same `key`
 * field. They were text labels because lucide-react dropped its brand icons upstream; a
 * word in a footer is not what anyone scans for, and at 20px the glyph is the only form
 * that reads. A key with no glyph renders nothing rather than an empty box.
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

/** Everything valid enough to render as a footer icon. */
export function publishableProfiles() {
  return (site.socialProfiles || []).filter(isPublishable);
}

/**
 * Only profiles this business actually owns.
 *
 * `sameAs` is an identity claim — it tells Google "these accounts and this company are
 * the same entity". A slot marked `owned: false` is a link to a platform's front door,
 * not to a profile of ours, so it may appear as a footer icon but must never appear
 * here. Asserting ownership of instagram.com would be a false statement about the
 * business with nothing to flag it.
 */
export function ownedProfiles() {
  return publishableProfiles().filter((p) => p.owned !== false);
}

export function SocialLinks({ className }) {
  const profiles = publishableProfiles();
  if (!profiles.length) return null;

  return (
    <nav aria-label="Social profiles" className={className}>
      <ul className="flex flex-wrap items-center gap-2">
        {profiles.map((p) => (
          <li key={p.key}>
            <a
              href={p.url}
              aria-label={p.label}
              title={p.label}
              /*
                `rel="me"` states that this profile and this site are the same entity —
                the convention identity verifiers read — so it is only correct on a
                profile we own. A slot marked `owned: false` points at a platform's front
                door instead, and gets `nofollow` rather than an identity claim we cannot
                make. `noopener` on both, because they open in a new tab.
              */
              rel={p.owned === false ? "noopener nofollow" : "me noopener"}
              target="_blank"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-l2"
            >
              <SocialMark platform={p.key} className="h-[18px] w-[18px]" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
