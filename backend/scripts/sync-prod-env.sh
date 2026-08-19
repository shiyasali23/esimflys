#!/usr/bin/env bash
#
# Push every key in backend/.env.prod to Railway in one command.
#
#     ./scripts/sync-prod-env.sh            # show what WOULD change, change nothing
#     ./scripts/sync-prod-env.sh --apply    # actually set them
#
# Why a script and not a git push hook: doing this on push would mean the secrets live
# in the repo, and a private repo is not a secret store — every clone, every CI cache and
# every laptop backup then holds live Stripe and Google credentials, and `git rm` does not
# remove them from history. This keeps .env.prod on your machine only.
#
# Cloudflare is deliberately not touched. The Worker holds no secrets: its only binding is
# BACKEND_ORIGIN, a public URL committed in frontend/wrangler.jsonc.

set -euo pipefail
cd "$(dirname "$0")/.."

FILE=".env.prod"
APPLY=""
[ "${1:-}" = "--apply" ] && APPLY=1

[ -f "$FILE" ] || { echo "error: $FILE not found. Copy .env.prod.example to $FILE and fill it in."; exit 1; }

# Refuse to run against a file git can see. Cheap, and catches a broken .gitignore
# before a secret reaches a commit rather than after.
if ! git check-ignore -q "$FILE"; then
  echo "REFUSING: $FILE is not gitignored. Fix .gitignore before running this."
  exit 1
fi

command -v railway >/dev/null || { echo "error: railway CLI not installed — 'brew install railway'"; exit 1; }
railway status >/dev/null 2>&1 || { echo "error: not linked to a project — run 'railway link' first"; exit 1; }

ARGS=(); NAMES=(); BAD=()
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  [[ "$line" == *=* ]] || continue
  k="${line%%=*}"; v="${line#*=}"
  # DATABASE_URL is provided by Railway's Postgres service reference. Setting it by hand
  # pins a URL that changes when the database is redeployed, and the app then talks to a
  # database that no longer exists.
  [ "$k" = "DATABASE_URL" ] && { echo "  skip  $k (managed by Railway)"; continue; }
  case "$v" in *PASTE_ME*) BAD+=("$k"); continue ;; esac
  [ -z "$v" ] && { BAD+=("$k (empty)"); continue; }
  ARGS+=("--set" "$k=$v"); NAMES+=("$k")
done < "$FILE"

if [ ${#BAD[@]} -gt 0 ]; then
  echo; echo "REFUSING — these are still unfilled in $FILE:"
  printf '    %s\n' "${BAD[@]}"
  echo; echo "Pushing a literal 'PASTE_ME' is worse than pushing nothing: the app boots and"
  echo "fails at the first real request instead of failing loudly at deploy."
  exit 1
fi

# Names only. Values are never printed, so this is safe to run with someone watching
# and safe to paste into a chat or an issue.
echo "${#NAMES[@]} keys ready:"
printf '    %s\n' "${NAMES[@]}"

if [ -z "$APPLY" ]; then
  echo; echo "Dry run — nothing sent. Re-run with --apply to set them on Railway."
  exit 0
fi

echo; echo "Setting on Railway…"
railway variables "${ARGS[@]}"
echo "Done. Railway redeploys automatically; watch it with 'railway logs'."
