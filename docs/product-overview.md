# MeetWise Product Overview

Version: 1.1 (Living document)
Last updated: 2026-07-03
Product: MeetWise

## 1. Purpose of this document

This document provides a structured, high-level description of the entire MeetWise product.
It is intended to be a foundational source for future documentation, including:

- Product Requirements Documents (PRD)
- Architecture and technical docs
- Security and compliance docs
- User guides and onboarding docs
- API and integration documentation

## 2. Product summary

MeetWise is a SaaS product that helps teams understand and optimize the cost and effectiveness of meetings.
It connects to Microsoft Outlook Calendar, estimates meeting costs based on team hourly rates, and provides AI-powered recommendations to reduce meeting waste.

Core value proposition:

- Visibility: reveal real meeting cost in currency and time
- Insight: identify inefficient patterns and high-cost recurring meetings
- Action: help teams make better scheduling and collaboration decisions

## 3. Problem statement

Most teams run many meetings but cannot clearly answer:

- How much are meetings actually costing us?
- Which meeting types create value vs waste?
- Where should we reduce, shorten, or redesign recurring meetings?

MeetWise addresses this by transforming calendar metadata into cost intelligence and actionable recommendations.

## 4. Target users

Primary users:

- Team managers and leads
- Operations managers
- Department heads

Secondary users:

- Individual contributors who need personal meeting visibility
- Finance and people operations stakeholders

Buyer profile:

- Small and medium organizations using Microsoft 365 / Outlook

## 5. Product goals and non-goals

### Goals

- Provide accurate, understandable meeting cost analytics
- Make onboarding fast (minutes, not days)
- Offer clear AI recommendations that lead to measurable behavior change
- Support multilingual experience (currently EN and DE)
- Maintain user trust through transparent privacy and consent handling

### Non-goals (current stage)

- Full email content analysis
- Real-time meeting transcription
- Generic project management platform features
- Broad calendar provider support beyond the current Microsoft-first approach

## 6. Core features

### 6.1 Landing and positioning

- Product landing page with:
  - Value proposition
  - Feature highlights
  - How-it-works section
  - Pricing section
  - FAQ section
  - Legal links (Privacy Policy and Terms of Use)

### 6.2 Authentication and account lifecycle

- Email/password registration and login
- Email confirmation flow
- Password reset flow
- Auth pages with locale-aware routing

### 6.3 Team onboarding and membership

- Create team or join existing team
- Team code and invitation flow
- Team member management
- Manager role support

### 6.4 Calendar integration (Microsoft)

- Connect Outlook via OAuth
- Securely store refresh token (encrypted)
- Trigger calendar sync
- Import and process meeting metadata for analytics

### 6.5 Cost analytics and dashboards

- KPI cards (weekly, monthly, annual, custom periods)
- Meeting cost trend chart
- Recent meetings list with filtering, searching, and sorting
- Breakdown by meeting patterns and efficiency indicators

### 6.6 AI insights

MeetWise AI Insights are focused on operational decisions, not generic summaries.

Primary outcomes:

- Identify where meeting cost is high relative to value
- Quantify low-efficiency meeting spend
- Recommend concrete actions with estimated savings

AI Insights workflow:

1. Meetings are imported from Outlook and mapped to team members.
2. Meeting cost is computed from participant rates and duration.
3. Poll signals and meeting metadata are prepared for analysis.
4. AI produces efficiency scores and recommendation text.
5. Dashboard/Insights views expose priorities and estimated savings.

Main AI inputs:

- Meeting title and context metadata
- Planned vs actual duration
- Participant count and attendance context
- Team cost per meeting
- Poll responses (usefulness, focus, perceived quality)

Main AI outputs:

- Meeting-level efficiency score (0-100)
- Meeting insight text (what looks inefficient and why)
- Team-level recommendation set with priority labels (High/Medium/Low)
- Estimated monthly savings per recommendation (advisory)

Current savings model in product:

- Estimated Monthly Savings (headline KPI) is derived conservatively from low-efficiency meeting spend.
- Baseline formula used in the app: 40% x total cost of meetings with efficiency score below threshold (currently 50).

Important boundaries:

- AI recommendations are decision support, not automatic policy enforcement.
- Savings numbers are estimates and should be validated by team lead decisions.
- Insight quality depends on sync coverage, member-rate completeness, and poll response quality.

### 6.7 Subscription and monetization

- Free and Pro plan model
- Stripe checkout for upgrades
- Plan-aware UI behavior across app features

### 6.8 Legal and compliance UX

- Dedicated Privacy Policy and Terms pages
- Explicit legal consent checkbox during registration
- Legal consent audit logging in database
  - Policy type
  - Policy version
  - Acceptance timestamp
  - Acceptance source

### 6.9 Screens and functional scope

The product is organized into three screen groups.

Public screens:

- Landing page
  - Value proposition, features, pricing, FAQ, legal links
  - CTA paths to registration and upgrade
- Terms of Use and Privacy Policy pages
  - Versioned legal content suitable for consent audit linkage

Auth and onboarding screens:

- Register
  - Account creation
  - Mandatory acceptance of Terms and Privacy
  - Legal linkout in a new tab
- Login
  - Standard sign-in and account access
- Password reset
  - Request and update flow
- Onboarding
  - Create team or join existing team via code/link

Product screens (authenticated):

- Dashboard
  - Core KPIs (cost/time by selected period)
  - Forecast summary
  - Calendar sync status and actions
  - Recent meetings module with filter/search/sort
- Meetings
  - Meeting and series list
  - Period filters and custom date range
  - Sorting by date/duration/participants/cost
- AI Insights
  - Efficiency distribution and analyzed coverage
  - Recommendation cards with priority and potential savings
  - Data details view for transparency of calculations
- Team
  - Team membership management
  - Team join code/invite flow
  - Manager-oriented setup controls
- Polls
  - Post-meeting qualitative signal capture
  - Inputs that enrich AI insight quality
- Settings
  - Profile and account settings
  - Security-related actions (e.g., credential updates)
- Upgrade
  - Free vs Pro comparison
  - Stripe checkout and plan state handling

### 6.10 Team Lead capability model

Team Lead (manager) is the operational owner of meeting efficiency in MeetWise.

What Team Lead can do:

- Team governance
  - Create/manage team structure
  - Invite members and share join code
  - Ensure member hourly rates are complete for accurate costing
- Data readiness
  - Drive Outlook connection adoption
  - Trigger/monitor calendar sync status
  - Resolve missing data conditions (unmatched emails, incomplete member data)
- Cost control
  - Review high-cost recurring meetings
  - Compare period-over-period trends (week/month/year/custom)
  - Identify over-attended or overlong meeting patterns
- AI-assisted optimization
  - Review AI priorities and recommendations
  - Convert recommendations into team operating rules
  - Track whether actions reduce low-efficiency spend
- Compliance and trust
  - Operate within explicit user-consent boundaries
  - Use legal and privacy pages as communication references for rollout

What Team Lead cannot do automatically:

- Auto-edit participant calendars without user/tenant permissions
- Enforce policy directly in Microsoft 365 from MeetWise
- Treat AI output as guaranteed financial outcome

## 7. Product workflow (end-to-end)

1. User lands on marketing page and understands value proposition.
2. User registers and explicitly accepts Terms and Privacy.
3. User confirms account and signs in.
4. User creates or joins a team.
5. User connects Outlook calendar.
6. System syncs meeting metadata and calculates costs.
7. User reviews dashboards and meeting-level insights.
8. Team acts on recommendations and tracks improvements over time.
9. User upgrades to Pro when advanced AI capabilities are needed.

## 8. High-level architecture

### Frontend

- Next.js App Router application
- Component-based UI (Tailwind + shadcn/Radix primitives)
- Locale-based routing and messages (next-intl)

### Backend

- Next.js server routes and server actions
- Supabase Auth + PostgreSQL
- Row Level Security plus service-role operations where required

### Integrations

- Microsoft Graph (calendar OAuth and event sync)
- Stripe (billing and subscription lifecycle)
- OpenAI/Azure AI model usage for insights
- Resend (transactional emails)

## 9. Data and domain overview

Main domain entities include:

- Users and profiles
- Teams and team membership
- Meetings and occurrences
- Cost metrics and aggregates
- AI insights and recommendations
- Subscription state
- Legal consent audit events

Data handling principles:

- Minimize sensitive data storage where possible
- Encrypt sensitive tokens
- Associate actions and records with authenticated user identity
- Preserve auditable legal-consent history by version

## 10. Security and trust model

Security priorities:

- Server-verified user identity for auth-sensitive operations
- Secure OAuth state validation and token lifecycle handling
- Encrypted storage of refresh tokens
- Principle of least privilege for DB access and service keys

Trust and compliance posture:

- Transparent legal documents
- Explicit user consent in registration flow
- Consent audit records suitable for policy-version traceability

## 11. Localization and markets

Current language support:

- English (en)
- German (de)

Localization scope:

- Landing and app UI copy
- Auth and dashboard content
- Legal labels and links

## 12. Pricing model

Plans:

- Free plan:
  - Core visibility and limited AI usage
- Pro plan:
  - Expanded analytics and higher AI limits

Monetization mechanism:

- Stripe subscription checkout and lifecycle events

## 13. Success metrics (suggested baseline)

Acquisition and onboarding:

- Landing-to-signup conversion rate
- Signup-to-calendar-connect rate
- Time to first insight

Product value:

- Weekly active teams
- Meetings analyzed per active team
- Percentage of teams acting on recommendations
- Estimated monthly savings surfaced

Commercial:

- Free-to-Pro conversion
- Pro retention and churn

## 14. Risks and constraints

- Dependence on Microsoft calendar permission model and tenant policies
- Quality of insights depends on imported data quality and coverage
- AI recommendation quality varies by model and prompt quality
- Third-party service reliability (Supabase, Stripe, Microsoft, AI providers)

## 15. Documentation expansion plan

This overview can be split into dedicated docs later:

- docs/product/vision-and-strategy.md
- docs/product/personas-and-jobs-to-be-done.md
- docs/product/feature-specs.md
- docs/architecture/system-overview.md
- docs/security/security-and-compliance.md
- docs/integrations/microsoft-graph.md
- docs/integrations/stripe-billing.md
- docs/operations/runbooks.md
- docs/legal/legal-consent-audit.md

## 16. Change log

- 2026-07-02: Initial version created as product-level foundation document.
- 2026-07-03: Expanded with detailed AI Insights behavior, screen-by-screen scope, and Team Lead capability model.
