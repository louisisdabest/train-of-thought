# Fieldnotes

A visual thinking space for capturing individual ideas, connecting them into directed paths and branches for a day, and revisiting them later.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/thought-journal/src/App.tsx` — daily thought map, review queue, and archive screens
- `artifacts/api-server/src/routes/thoughts.ts` — thought, category, and daily summary endpoints
- `artifacts/api-server/src/routes/thought-links.ts` — directed connections between thought blocks
- `lib/db/src/schema/thoughts.ts` — thought, category, and connection data model
- `lib/api-spec/openapi.yaml` — API contract and generated client/schema source

## Architecture decisions

- Each browser gets a signed anonymous thought-map session; ideas, links, and categories are isolated per browser. There is no account-based cross-device sync yet.
- Calendar requests include the browser's timezone offset so day filters follow the user's local calendar.
- OpenAPI is the source of truth for backend validation and generated frontend hooks.

## Product

- Capture freeform idea blocks without requiring a title.
- Connect blocks into directed paths and branches for each day.
- Create categories, schedule reviews, and reopen prior daily thought maps.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
