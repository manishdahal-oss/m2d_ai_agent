# Vyapar M2D AI WhatsApp Agent

Convert eligible Vyapar **mobile** customers into Vyapar **Desktop** users over WhatsApp.
Customers not assigned to Technotask (human calling) get a WhatsApp message through the Times WhatsApp API.
When they reply, an AI agent answers using approved Vyapar information, shares the Desktop link, and hands off to a human when needed.

> **Status: MVP, phases 1–2 complete, on Convex.** Schema, live dashboard and CSV import work.
> Times, the webhook, the AI engine and human takeover come in later phases (see Roadmap).

## Stack

- **Backend and database: [Convex](https://convex.dev).** It holds the schema, queries, mutations and actions, and will host the webhook.
  - Project: `whatsapp m2d project` (team `manish-dahal`), dev deployment `impartial-pheasant-930`.
  - Dashboard: https://dashboard.convex.dev/t/manish-dahal/whatsapp-m2d-project/impartial-pheasant-930
- **Dashboard:** React, Vite, Tailwind, React Router. Data comes through **live Convex subscriptions**, so pages update the moment data changes, with no refresh.

## Quick start

```sh
npm install
npm run dev            # convex dev (pushes functions on save) + dashboard on http://localhost:5180
npm run demo:load      # optional: clearly-labelled demo data (isDemo = true)
```

`.env.local` (gitignored) holds `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and a dev `CONVEX_DEPLOY_KEY`, so the CLI works without `npx convex login`.

| Command | What it does |
|---|---|
| `npm run dev` | Convex watcher + Vite |
| `npm test` | Shared rule tests + Convex function tests (`convex-test`, in-memory backend) |
| `npm run typecheck` / `npm run build` | Type-check dashboard and Convex / production build |
| `npm run demo:load` / `demo:clear` | Load or replace demo data / remove demo data only |
| `npx convex env set NAME value` | Set a backend secret (Times, NVIDIA, …) |
| `npm run deploy:functions` | Deploy functions to production (needs a prod deploy key) |

## Architecture

```
convex/                  backend (runs on Convex)
  schema.ts              tables + indexes (uniqueness enforced in mutations via indexes)
  customers.ts           live list (search + filters, cursor pagination), detail, CSV import mutations
  conversations.ts       live list, Needs Human queue + count
  campaigns.ts           campaign config (builder = phase 3)
  analytics.ts           action: pages through tables → metrics, funnel, breakdowns, campaign stats
  settings.ts            read-only settings (booleans / public values only)
  whatsapp/              provider.ts (interface) · times.ts (Times API) · mock.ts · testSend.ts (Settings test sender) · webhook.ts (public HTTP endpoint)
  engine.ts              inbound → rules → AI → reply (state machine, cap, opt-out, hand-off)
  ai/                    provider.ts (LLM interface) · nvidia.ts (Nemotron) · agent.ts (prompt + JSON validation)
  demo.ts                internal: demo:load / demo:clear
  maintenance.ts         internal: remove TEST- data after automated tests
  lib/config.ts          the ONLY place env vars are read (Convex environment variables)
  *.test.ts              convex-test suites
shared/                  used by both the backend and the dashboard
  conversationStates.ts  13-state machine + allowed transitions
  customerImport/        column mapping, phone normalisation, eligibility, preview analysis
  knowledge/             APPROVED Vyapar Desktop knowledge (the AI may only use this)
  languages.ts           en + hi enabled; 8 more registered
src/                     dashboard (pages, components, lib/convex.ts)
```

### CSV import

1. **In the browser:** parse the file, normalise phones (E.164, India), drop invalid and duplicate rows, and look up existing customers. This produces the six preview counts; nothing is saved yet.
2. **On confirm:** rows go to `customers.importChunk` in batches of 250. **The server re-validates every row**: phone, customer_id conflicts, eligibility and opt-out. Re-uploading a file is safe, because it updates and never duplicates.

Every valid row lands in exactly one bucket, in this order:
**opted out → assigned to Technotask → already on Desktop → already contacted → eligible.**
Opt-out is permanent: a re-import never makes an opted-out customer eligible again.
Unknown columns are kept in `customers.attributes`.

### Analytics

Convex has no SQL aggregates. `analytics.compute` is an action that pages through conversations, customers and enrollments (2,000 rows per page) and aggregates in memory. That's fine for hundreds of thousands of rows; beyond that, add the `@convex-dev/aggregate` component. The funnel counts **milestone timestamps** as distinct customers. Message counts are stored on each conversation.

### Planned message flow (phases 4–7)

```
Outbound: campaign RUNNING → eligible, not opted out, not demo → rate limit → template
          → WhatsAppProvider.sendTemplate (idempotency key) → messages + MESSAGE_SENT
Inbound:  Times → POST https://impartial-pheasant-930.convex.site/webhooks/whatsapp (Convex HTTP action)
          → verify signature → webhookEvents (dedupe) → 200 → map payload → save inbound
          → rules first (STOP, human request) → AI (profile + campaign + approved knowledge + history)
          → state transition → send via provider → save. The dashboard updates live.
```

## Security and access

- **Sign-in:** email and password through Convex Auth. It's **invite-only**: sign-up and sign-in only work for addresses in `ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS`. An empty list lets nobody in.
  ```sh
  npx convex env set ALLOWED_EMAILS "you@example.com,colleague@example.com"
  ```
- **Every public backend function** goes through `authedQuery` / `authedMutation` / `authedAction` (`convex/lib/access.ts`). Each call checks the session **and** that the email is still allowlisted, so removing someone takes effect immediately.
- **Two tests keep it that way:**
  - `convex/auth.test.ts` proves every public function rejects anonymous and non-allowlisted callers.
  - `convex/publicFunctions.guard.test.ts` fails if any module uses the raw builders.
- Convex Auth rate-limits failed password attempts. There's no email-based password reset yet (no email provider); an admin can reset an account from the Convex dashboard.
- Secrets live only in Convex environment variables. The browser gets the public deployment URL and nothing else.
- Internal functions (`demo:*`, `maintenance:*`) can't be called from the browser.
- CSV uploads record who ran them (`importBatches.importedBy`).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Schema, dashboard | ✅ (Convex) |
| 2 | CSV import with validation | ✅ |
| — | Dashboard authentication (Convex Auth, invite-only) | ✅ |
| 3 | Campaign builder | next |
| 4 | `WhatsAppProvider` + Times provider (send template/text, retries, test sender) | ✅ sending · waiting on approved template name |
| 5 | Webhook (`/webhooks/whatsapp`, Cloud API format, dedupe, raw payloads stored) | ✅ live · confirm Times' exact format |
| 6 | Conversation engine (opt-out, 10-message cap + closing msg, human hand-off, debounce, idempotent replies) | ✅ · AUTO_REPLY_MODE=test_only |
| 7 | NVIDIA Nemotron provider + knowledge-only fallback | ✅ code · needs NVIDIA_API_KEY |
| 8 | Human takeover | |
| 9 | Analytics extensions | basic funnel ✅ |
| 10 | Regional languages | registry ✅ |
