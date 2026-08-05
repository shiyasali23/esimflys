---
description: Full autonomous deploy-readiness audit of the eSIMFlys backend and frontend
---

Run the complete eSIMFlys deploy-readiness audit. Work autonomously to completion — this
is a long task and that is expected. Do not stop to ask which area to start with.

## Step 1 — preflight, before anything else

The audit is invalid if the stack is not up. Check all four, and start whatever is
missing:

```
cd /Users/macbookpro/Desktop/code-red/esim/backend && source .venv/bin/activate
python manage.py runserver 8000
python manage.py process_jobs      # REQUIRED — without it orders never reach delivered
stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe/
cd /Users/macbookpro/Desktop/code-red/esim/frontend && npm run dev
```

Run background processes with `run_in_background: true` so they survive across tool calls.

Then confirm the database is healthy before drawing conclusions from any failure:

```bash
psql -d postgres -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname='esimflys_dev'"
```

Under bursty load this pool has exhausted twice (103 backends against a 100 limit),
producing 503s on `/health/ready/` and 500s across the API. Suspected `CONN_MAX_AGE=60`
at `backend/config/settings.py:81` plus the threaded dev server — not confirmed, and
likely a dev-only artifact. If the backend starts failing mid-audit, check this count
before treating the cascade as real findings. Restarting clears it.

Report what you started and what was already running. If something cannot start, say so
plainly and continue with everything that does not depend on it.

## Step 2 — run the audit

Invoke the `audit-esimflys` workflow. It runs six specialist auditors in parallel across
the money path, authorization and tenancy, contract drift, error paths, storefront UI and
portal UI; puts every candidate finding through an independent agent whose job is to
refute it; and writes the surviving findings to `esim/audit/FRONTEND_AUDIT.md` and
`esim/audit/BACKEND_AUDIT.md`.

It runs in the background. While it does, do not sit idle — read
`backend/docs/FRONTEND_BACKEND_CONTRACT.md` yourself so you can judge the findings when
they arrive rather than relaying them unread.

## Step 3 — report back

When the workflow finishes, read both files before summarising them. Then tell me:

- the count by severity, per surface
- the single most urgent thing to fix, and why it is the most urgent
- anything the audit could not verify, and what access it would need
- any area whose coverage was thinner than the others

If any finding looks wrong to you on reading it, say so — surviving the refutation pass
is evidence, not proof. Do not fix anything yet; I will decide what to act on.
