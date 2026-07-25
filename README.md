# eSIMFlys

A travel-eSIM storefront: buy a prepaid, data-only eSIM for your destination, scan a QR code, and get online on arrival while keeping your own number.

Monorepo with two apps:

| Folder | Stack | What it is |
|---|---|---|
| [`frontend/`](./frontend) | Next.js 16 · React 19 · Tailwind v4 | SEO-first storefront — destinations, per-country plans, checkout |
| [`backend/`](./backend) | Django 5.2 · DRF · PostgreSQL | API — catalog, accounts, checkout, payments, eSIMs |

Each folder is self-contained and can run on its own. See `frontend/README.md` and `backend/README.md` for full details.

## Quick start

### Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```
Runs standalone on the bundled catalog (`src/data/catalog.json`, mock mode). To point it at the live API, set `USE_MOCKS=false` and `API_BASE_URL` in `.env.local`.

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .                     # dependencies are in pyproject.toml
cp .env.example .env                 # then fill in real values
python manage.py migrate             # needs a PostgreSQL database
python manage.py import_catalog      # loads data/eSIM_DB_Catalogue_Launch.xlsx
python manage.py runserver           # http://localhost:8000
```

## Configuration & secrets
Secrets are **not** committed. Each app ships a `.env.example` — copy it to `.env` (backend) / `.env.local` (frontend) and fill in your own values (Django secret key, `DATABASE_URL`, Google OAuth, Stripe, encryption keys, etc.).

## Data
- `backend/data/eSIM_DB_Catalogue_Launch.xlsx` — source catalogue, imported into the DB via `import_catalog`.
- `frontend/src/data/catalog.json` — the generated catalogue the storefront reads directly.

> Private repository — the catalogue files contain wholesale, competitor, and supplier pricing.
