# MeetWise UI Prototype

**AI-powered meeting cost analytics — built with Next.js 15 and a modern SaaS stack.**

> Know the real cost of your meetings, in real time, across teams and locales.

---

## Stack at a Glance

- **Framework**: Next.js 15 (App Router, TypeScript, strict mode)
- **UI**: React 18, shadcn-ui (Radix-based), Tailwind CSS
- **Auth & DB**: Supabase (PostgreSQL + Auth) with RLS and server/client helpers
- **i18n**: `next-intl` with locale routing (`/[locale]/...`, `en` & `de`)
- **Charts**: Recharts
- **Payments**: Stripe (checkout + webhooks for Pro subscriptions)
- **Email**: Resend (invites, registration confirmation)
- **Integrations**: Microsoft Graph (Outlook calendar sync), OpenAI (insights)

The app is a **full-stack prototype** for MeetWise: dashboards with real cost KPIs, calendar sync, team management, Pro upgrade flow, and a glassmorphism / gradient theme.

---

## Project Structure

- `src/app`
  - `layout.tsx` – root HTML shell (+ toasters, tooltips, global styles)
  - `[locale]/layout.tsx` – `NextIntlClientProvider`, `UserProvider`, auth-aware user/plan data
  - `[locale]/page.tsx` – landing
  - `[locale]/(auth)/login|register|onboarding` – auth flow
  - `[locale]/(dashboard)/dashboard|meetings|team|settings|upgrade` – app pages
  - `[locale]/join` – join team via link/code
- `src/components`
  - `AppSidebar`, `TopBar`, `AppDatePicker`, `MeetingTable`, `KpiCard`, `CostTrendChart`, `RecentMeetings`, `LanguageSwitcher`
  - `ui/*` – shadcn-style primitives (buttons, dialogs, calendar, popover, etc.)
- `src/lib`
  - `supabase.ts`, `microsoft-graph.ts`, `cost-engine.ts`, `openai.ts`, Resend usage in actions
- `messages`
  - `en.json`, `de.json` – translation messages
- `supabase/migrations`
  - SQL migrations for `profiles`, `teams`, `meetings`, `team_members`, Stripe billing columns

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20.9
- **npm** (or pnpm/yarn)

### 1. Install dependencies

```bash
git clone <YOUR_GIT_URL>
cd meetwise-ui-prototype
npm install
```

### 2. Configure environment

Copy the example env and set your values:

```bash
cp .env.example .env.local
```

**Required / recommended:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-only; keep secret) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | Azure AD app for Outlook calendar |
| `MICROSOFT_REDIRECT_URI` | e.g. `http://localhost:3000/api/auth/microsoft/callback` |
| `OPENAI_API_KEY` | For AI insights (optional) |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe test keys for Pro upgrade |
| `STRIPE_PRO_PRICE_ID` | Recurring price ID from Stripe Dashboard (Products → Add product) |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | For invite and registration emails |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |

### 3. Database (Supabase)

Run the migrations in order (e.g. in Supabase SQL Editor or CLI):

- `supabase/migrations/001_*.sql` through `006_stripe_billing.sql`

This creates `profiles`, `teams`, `meetings`, `team_members`, and Stripe-related columns.

### 4. Run the dev server

```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:3000`). Use the language switcher (EN / DE) in the header; routes stay in sync (`/en/dashboard` ↔ `/de/dashboard`).

---

## Key Flows

- **Auth** – Register (with email confirmation via Resend), login, onboarding (create or join team).
- **Dashboard** – KPI cards (weekly / monthly / annual cost, forecast), cost trend chart, recent meetings. Custom range uses an app-styled date picker.
- **Calendar sync** – Connect Microsoft account; sync imports meetings and computes costs from team member rates.
- **Team** – Share join link/code, add members, optional invite emails via Resend.
- **Upgrade** – Stripe Checkout for Pro; existing Pro users see “Current Plan” and cannot pay again.
- **Settings** – Display name, change password, plan badge, currency toggle.

---

## Scripts

- **`npm run dev`** – Start Next.js dev server.
- **`npm run build`** – Production build.
- **`npm run start`** – Start production server (after `build`).
- **`npm run lint`** – Run ESLint.
- **`npm run test`** / **`npm run test:watch`** – Run Vitest tests.

---

## Performance note (Supabase free tier)

On the Supabase free tier, cold starts and network latency can make **navigation between dashboard pages** (e.g. sidebar clicks) feel slow, because each route can trigger server-side fetches (user, team, plan). The app uses:

- **Prefetched links** in the sidebar (`Link` with `prefetch`) so routes load in the background when links are visible.
- **Loading UI** for the dashboard segment so a spinner shows immediately while the page loads.

For production, consider connection pooling (e.g. Supabase Pooler) and caching where appropriate.

---

## Where to Go Next

- Add more Stripe webhook handling (e.g. subscription cancelled, invoice failed).
- Expand `messages/en.json` / `de.json` for new copy.
- Harden rate limits and validation on auth and invite APIs.

This repo is a **launchpad**: production-ready UI, real auth and data, and clear extension points for scaling MeetWise.
