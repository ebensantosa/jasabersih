# JasaBersih Monorepo

On-demand cleaning service marketplace untuk Indonesia. Spec & PRD lengkap ada di [`../jasabersih-spec/docs/`](../jasabersih-spec/docs/).

## Workspaces

```
apps/
  api/      NestJS modular monolith (Prisma + Postgres+PostGIS + Redis)
  admin/    Next.js 14 (App Router + Tailwind + shadcn/ui)
  mobile/   Expo React Native (Zustand + TanStack Query + MMKV + NativeWind)
services/
  chat/     Standalone Socket.io service (di-pisah karena traffic pattern beda)
packages/
  shared-types/   TypeScript domain types & Zod schemas (di-share antar app)
  ui-kit/         Reusable RN components & theme tokens
  eslint-config/  Shared lint rules
```

## Setup Cepat

```bash
# 1. Prereqs: Node 20+, npm 10+, Docker
node -v   # >= 20

# 2. Install deps (npm workspaces — hoists ke root node_modules)
npm install

# 3. Bring up Postgres + Redis + MinIO (local R2 stand-in)
npm run docker:up

# 4. Setup API env
cp apps/api/.env.example apps/api/.env

# 5. Database
npm run db:migrate    # apply baseline schema
npm run db:seed       # services + pricing + add-ons + commission tiers

# 6. Run apps (di terminal terpisah)
npm run dev -w @jasabersih/api          # http://localhost:3000  (docs: /docs)
npm run dev -w @jasabersih/admin        # http://localhost:3001
npm run start -w @jasabersih/mobile     # Expo dev server
npm run dev -w @jasabersih/chat-service # ws://localhost:3100
```

## Sprint Status

Lihat `../jasabersih-spec/tasks/sprint-01-mvp.md`. Status:

- [x] Task 1 — Bootstrap monorepo
- [ ] Task 2 — CI/CD (workflow ada, perlu branch protection + Codecov token)
- [x] Task 3 — DB migrations baseline (semua tabel sesuai schema.md, partitioning + immutable ledger trigger)
- [x] Task 4 — Auth module (register / verify-otp / login / refresh / logout)
- [x] Task 5 — Mobile app shell + mode toggle
- [x] Task 6 — Admin dashboard skeleton (sidebar 9 modul + login)
- [ ] Task 7 — Sentry + PostHog (Sprint 2 — DSN & init)
- [ ] Task 8 — Privacy/T&C (legal — paralel)

## Konvensi

Semua aturan ada di `../jasabersih-spec/CLAUDE.md`. Highlight:

- TypeScript strict, no `any`
- Money = `bigint` rupiah utuh
- UUIDv4 PK, snake_case plural tables, soft delete via `deleted_at`
- API response shape: `{ data, error, meta }`
- Money & saldo via immutable ledger (jangan UPDATE balance field)
- Mobile pakai Zustand + TanStack Query + MMKV + FlashList + expo-image
- Backend retry/circuit breaker pakai `cockatiel`

## Default Decisions (open questions di CLAUDE.md)

| Item | Default |
|---|---|
| Cloud | GCP `asia-southeast2` (Jakarta) — UU PDP data sovereignty |
| Liveness vendor | Privy.id (Phase 2) |
| NPWP threshold | wajib di akumulasi withdrawal > Rp 4.5jt/tahun |
| WA survey margin | 10% flat (configurable di `commission_tiers`) |
| Insurance fund | virtual ledger (`INSURANCE_POOL` account_type) Phase 1 |
| Tip cleaner | prompt setelah selesai (di rating screen) |

Override via PR + update tabel di CLAUDE.md kalau ada keputusan beda.
