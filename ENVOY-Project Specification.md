# ENVOY — Project Specification & Agent Reference
> **Economic Navigator & Virtual Operations Yielder**
> Living reference document for all coding agents working on this codebase.
> Read this file in full before making any changes. Do not break existing workflows.

---

## 0. How to Use This Document

This file is the single source of truth for the ENVOY platform. Every coding agent — regardless of which phase or feature it is implementing — must:

1. Read this document fully before writing any code
2. Preserve every workflow marked **[PROTECTED]** — these must never be broken
3. Append to this document when new features are completed (see Section 9)
4. When in doubt about a design decision, default to what is already established here

---

## 1. Mission Context

**Platform:** ENVOY — Agentic AI Platform for Economic Diplomacy

**Diplomat profile:**
- Home country: **Myanmar**
- Host country / post: **India (New Delhi)**
- Role: Commercial Attaché — Myanmar diplomatic mission in India
- Primary responsibility: Myanmar–India bilateral trade promotion and investment facilitation

**Core intelligence focus:**
- India economic policy, RBI monetary decisions, Ministry of Commerce directives
- Myanmar–India bilateral trade flows, tariff changes, border trade
- ASEAN–India frameworks (BIMSTEC, Act East Policy, Kaladan corridor)
- Northeast India economic developments (borders Myanmar)
- FDI regulations affecting Myanmar investors in India
- Keywords always escalated to HIGH priority: `Myanmar`, `Burma`, `ASEAN`, `Act East Policy`, `India-Myanmar`, `Northeast India`, `Moreh`, `Mizoram`, `Bay of Bengal`, `BIMSTEC`, `Kaladan`, `border trade`, `Sagaing`

---

## 2. Platform Philosophy — Non-Negotiable Principles

These principles govern every design and implementation decision. No feature may violate them.

### 2.1 Approve-Before-Send **[PROTECTED]**
No outbound action — email sent, introduction made, document filed, communication dispatched — executes without explicit diplomat approval. This is enforced at the **application layer**, not just the UI. The `approved_at` timestamp on every approval record is the enforcement mechanism. `null` = pending, never skip.

### 2.2 Data Sovereignty
No sensitive diplomatic data transits commercial shared infrastructure. All LLM inference for sensitive content must be routable to self-hosted models. The architecture must remain model-agnostic — no feature may be hard-coupled to a specific LLM provider.

### 2.3 Human-in-the-Loop
ENVOY is a decision-support and execution accelerator. The diplomat remains the final gate on all consequential outputs. Agents prepare, recommend, and draft. They never send, introduce, or act autonomously.

### 2.4 Audit Immutability **[PROTECTED]**
The `audit_log` table has a database-level trigger preventing `UPDATE` and `DELETE`. This must never be removed or circumvented. Every agent action — every draft, recommendation, approval — is logged with a full reasoning trace.

### 2.5 Agent Isolation
Each agent operates within a bounded domain. Agents do not call each other directly — they communicate through shared database tables. The Consul orchestrates cross-agent workflows by reading from and writing to these shared tables.

---

## 3. Current Build Status

### Phase 1 — Prototype ✅ COMPLETE
React frontend, all 5 modules navigable, mock data, approve-before-send flows, design system.

### Phase 2 — Backend Foundation ✅ COMPLETE
PostgreSQL schema, REST API (Fastify + TypeScript), seed data, Docker, audit trail.

### Phase 3 — Agent Intelligence ✅ COMPLETE

| Agent | Status | Notes |
|---|---|---|
| The Scribe | ✅ Live | Gemini 2.5 Flash, background jobs, 10s polling |
| The Sentinel | ✅ Live | 8 RSS sources, 30-min cron, bilateral context prompt |
| The Connector | ✅ Live | Scoring engine, URGENT override, CRM input |
| Priority Inbox | ✅ Live | Gmail OAuth, Gemini classification, Auto-Scribe drafting |
| The Attaché | ✅ Live | Google Calendar sync, conflict detection |
| The Consul | ✅ Live | Routing LLM, task decomposition |
| Sentinel-Legal| ✅ Live | Sub-agent, regulatory change detection, entity cross-reference |

### Phase 4 — Sovereign Deployment ⬜ NOT STARTED
### Phase 5 — Intelligence & Events Engine ⬜ NOT STARTED

---

## 4. Technical Stack

### 4.1 Frontend
| Concern | Technology |
|---|---|
| Framework | React 19 with TypeScript |
| Styling | Tailwind CSS 4.0 |
| Animations | `motion` library |
| Icons | `lucide-react` |
| State | `useState` / `useEffect` — no external state library |
| Data fetching | `useEffect` + `fetch` — no React Query yet |
| Polling | `setInterval` at 10 seconds for task queue updates |
| Storage | No `localStorage` or `sessionStorage` — session-only state |

### 4.2 Backend
| Concern | Technology |
|---|---|
| Runtime | Node.js with TypeScript |
| Framework | Fastify |
| Database | PostgreSQL (production) / SQLite (preview/dev) |
| ORM / Query | `pg` or `drizzle-orm` |
| Validation | `zod` on all request bodies |
| Config | `dotenv` — all secrets via env vars |
| Scheduling | `node-cron` |
| RSS parsing | `rss-parser` |

### 4.3 AI / LLM
| Concern | Configuration |
|---|---|
| Primary model | `gemini-2.5-flash` via `@google/genai` SDK |
| API key env var | `GEMINI_API_KEY` |
| Batching | Sequential `await` between batches of 5 — never `Promise.all` for LLM calls |
| Response format | Always instruct model to return only valid JSON, no markdown fencing |
| Fallback | If LLM call fails, log error and set task `status: "failed"` — never crash the server |

### 4.4 Infrastructure
```
docker-compose.yml     — spins up local PostgreSQL
.env                   — all environment variables (never commit)
.env.example           — committed template with all keys, no values
```

**Required environment variables:**
```
DATABASE_URL=
GEMINI_API_KEY=
SENTINEL_CRON_INTERVAL=*/30 * * * *
CONNECTOR_CRON_INTERVAL=0 */6 * * *
PORT=3000
```

---

## 5. Database Schema

### 5.1 Enums
```sql
-- agent_name
sentinel | scribe | attache | connector | events_engine | sentinel_legal | consul

-- priority_level
high | medium | low

-- task_status
queued | in_progress | delivered | failed

-- match_status
queued | ready | urgent | actioned

-- urgency_level
high | medium | low

-- item_category
ministerial | inquiry | logistics | internal | event

-- intelligence_tag
MONETARY_POLICY | INVESTMENT_OPPORTUNITY | REGULATORY | TRADE_DATA
| CORPORATE | GEOPOLITICAL | BILATERAL
```

### 5.2 Core Tables

**`diplomats`**
```
id UUID PK | name TEXT | mission TEXT | role TEXT | preferences JSONB | created_at
```

**`entities`** — trade counterparties (home-country exporters and local-market partners)
```
id UUID PK | type TEXT (home/local) | name TEXT | sector TEXT
| hs_codes TEXT[] | size TEXT | objectives TEXT
| relationship_status TEXT | created_at
```

**`matches`** — immutable, append-only scoring records **[PROTECTED]**
```
id UUID PK | home_entity_id UUID FK | local_entity_id UUID FK
| score INT (0-100) | rationale TEXT | status match_status
| bilateral_relevance TEXT | created_at
```
> No ON DELETE CASCADE. Entity deletion must be handled manually.
> Never UPDATE a match row — create a new record instead.

**`intelligence_items`**
```
id UUID PK | tag intelligence_tag | source TEXT | headline TEXT (max 120)
| body TEXT | priority priority_level | flag BOOL | action TEXT
| bilateral_relevance TEXT | published_at TIMESTAMPTZ
| ingested_at TIMESTAMPTZ DEFAULT now()
```

**`tasks`**
```
id UUID PK | agent agent_name | type TEXT | title TEXT
| audience TEXT | format TEXT | pages INT
| status task_status | progress INT (0-100)
| payload JSONB  -- contains draft, source refs, data gaps
| due_at TIMESTAMPTZ | created_at
```

**`audit_log`** — append-only, triggers prevent UPDATE/DELETE **[PROTECTED]**
```
id UUID PK | agent agent_name | action_type TEXT | payload JSONB
| reasoning_trace TEXT | diplomat_id UUID FK
| approved_at TIMESTAMPTZ | created_at
```

**`inbox_items`**
```
id UUID PK | from_name TEXT | from_org TEXT | subject TEXT
| urgency urgency_level | category item_category
| body TEXT | draft_body TEXT | status TEXT (pending/approved/declined)
| read BOOL DEFAULT false | received_at TIMESTAMPTZ
```

**`delegation_events`**
```
id UUID PK | name TEXT | arrival TIMESTAMPTZ | departure TIMESTAMPTZ
| members JSONB | schedule JSONB | briefing_progress INT (0-100) | created_at
```

**`sentinel_sources`** — runtime-configurable feed list
```
id UUID PK | name TEXT | feed_url TEXT UNIQUE | priority TEXT
| active BOOL DEFAULT true | last_fetched_at TIMESTAMPTZ | last_error TEXT
```

### 5.3 Active Sentinel Sources
| Name | Feed URL | Priority |
|---|---|---|
| Ministry of Commerce & Industry India | `https://commerce.gov.in/rss` | high |
| Reserve Bank of India | `https://www.rbi.org.in/rss/RSSFeed.aspx` | high |
| Press Information Bureau (Economic) | `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1` | high |
| NITI Aayog | `https://www.niti.gov.in/rss.xml` | medium |
| World Bank | `https://feeds.feedburner.com/worldbankall` | medium |
| ASEAN Briefing | `https://www.aseanbriefing.com/news/feed/` | high |
| The Hindu Business Line | `https://www.thehindubusinessline.com/feeder/default.rss` | medium |
| Financial Express | `https://www.financialexpress.com/feed/` | medium |

---

## 6. API Reference

### 6.1 Conventions
- All responses: `Content-Type: application/json`
- Success wrapper: `{ data: ..., meta?: { total, page, limit } }`
- Error wrapper: `{ error: { code: string, message: string } }`
- All UUIDs in path params, never integers
- Pagination: `?page=1&limit=20` on all list endpoints
- No auth implemented yet — all endpoints are open (Phase 4 adds RBAC)

### 6.2 Endpoints

**Intelligence**
```
GET  /api/intelligence                    — paginated feed
     ?priority=high|medium|low            — filter by priority
     ?tag=BILATERAL|MONETARY_POLICY|...   — filter by tag
     ?bilateral=true                      — Myanmar-relevant items only
     ?flag=true                           — flagged items only
```

**Inbox**
```
GET  /api/inbox                           — all inbox items
POST /api/inbox/:id/approve               — approve draft, sets approved_at
POST /api/inbox/:id/decline               — decline, archives item
```

**Matches**
```
GET  /api/matches                         — all match records, ordered by score desc
     ?status=urgent|ready|queued|actioned — filter by status
POST /api/matches/:id/approve             — queue intro for send
POST /api/matches/:id/decline            — archive, suppresses entity for 30 days
```

**Tasks (Scribe)**
```
GET  /api/tasks                           — full task queue
POST /api/tasks                           — commission new task, fires background job
     body: { agent, type, title, audience, format, pages, instruction }
```

**Entities (Connector)**
```
GET  /api/entities                        — all entities
     ?type=home|local                     — filter by type
POST /api/entities                        — create entity, triggers matching run
     body: { type, name, sector, size, objectives, hs_codes }
```

**Delegations**
```
GET  /api/delegation/:id                  — full delegation with members + schedule
```

**Agent Status**
```
GET  /api/agents/status                   — live status of all 6 agents
```

**Admin / Manual Triggers (no auth yet)**
```
GET  /api/agents/sentinel/run             — manually trigger Sentinel feed run
GET  /api/agents/connector/run            — manually trigger full matching run
GET  /api/sentinel/sources                — list all configured sources
PATCH /api/sentinel/sources/:id           — toggle active, update config
```

---

## 7. Agent Specifications

### 7.1 The Sentinel — `src/agents/sentinel.ts`
**Trigger:** Cron (`SENTINEL_CRON_INTERVAL`), server startup (immediate run), manual via API
**Pattern:** Fetch all active sources in parallel with `Promise.allSettled` — never let one failure block others. Log source errors to `sentinel_sources.last_error`.
**Deduplication:** By RSS `guid` or source URL — never insert the same item twice
**Post-processing:** After Gemini classification, run keyword escalation in TypeScript (no LLM). If any Myanmar-context keyword matches, set `priority: "high"` and `flag: true`
**Output:** Writes to `intelligence_items` table

**System prompt character:** Economic intelligence analyst for Myanmar mission in India. Always frames findings through Myanmar–India bilateral trade lens.

---

### 7.2 The Scribe — `src/agents/scribe.ts`
**Trigger:** `POST /api/tasks` with `agent: "scribe"` — user-initiated
**Pattern:** Return task ID immediately (non-blocking HTTP response). Background async job calls Gemini, updates task row on completion.
**Output:** Updates `tasks.payload.draft`, sets `status: "delivered"`, `progress: 100`
**Failure:** Sets `status: "failed"`, logs error to `tasks.payload.error` — never crashes server

**System prompt character:** Specialist diplomatic writer. Formal register always. Flags data gaps as `[DATA GAP: description]`. Structures output with clear section headings. Never casual.

---

### 7.3 The Connector — `src/agents/connector.ts`
**Trigger:** Cron (`CONNECTOR_CRON_INTERVAL`), server startup, `POST /api/entities` (after insert)
**Pattern:** Score all unmatched home × local entity pairs sharing overlapping sector. Batch 5 pairs per Gemini call. Sequential `await` between batches — never `Promise.all` for LLM.
**Threshold:** Only insert matches with score ≥ 60. Discard lower silently.
**URGENT override:** After scoring, query `intelligence_items` for `flag = true` items in last 48 hours. If local entity name or sector matches any flagged item's body — set `status: "urgent"` regardless of score.
**Deduplication:** Skip pairs where a row already exists in `matches` for that `home_entity_id` + `local_entity_id` combination.
**Output:** Writes to `matches` table. Never updates existing rows — always appends.

**System prompt character:** Trade matchmaking specialist. Specific rationales — no generic filler. 2–4 sentences per match.

---

### 7.4 Priority Inbox — `src/agents/inbox.ts`
**Trigger:** Cron (`INBOX_CRON_INTERVAL`), server startup, manual via API
**Pattern:** Fetch unread emails via Gmail API OAuth, deduplicate by message ID.
**Processing:** Run Gemini to classify email (Urgency, Category, requires_draft).
**Output:** Inserts into `inbox_items` table.
**Auto-Commission:** If `requires_draft` is true, immediately commissions The Scribe to draft a reply using the returned instruction. Wait for Scribe payload, then update `inbox_items.draft_body`.

**System prompt character:** The Consul's inbox triage agent. Decisive categorisation. Flags actionable Myanmar-India bilateral matters for immediate reply drafting.

---

### 7.5 The Attaché — `src/agents/attache.ts` ⬜ NOT YET BUILT
**Planned trigger:** Delegation creation / update
**Planned output:** Run-of-show conflicts flagged, briefing card status updates, `delegation_events` table

---

### 7.6 The Consul — `src/agents/consul.ts` ✅ LIVE
**Trigger:** Natural language input from command interface
**Pattern:** Routing LLM decomposes intent via dynamic context injection, delegates to appropriate agent function or DB query.
**Output:** Orchestrates cross-agent workflows, surfaces consolidated briefings and renders actions.

---

### 7.7 Sentinel-Legal — `src/agents/sentinel-legal.ts` ✅ LIVE
**Trigger:** Cron (`SENTINEL_LEGAL_CRON_INTERVAL`), chained after `runSentinel()`
**Pattern:** Sub-agent of The Sentinel. Scans recent `REGULATORY`/`BILATERAL` intelligence items. Cross-references affected sectors with `home` entities.
**Output:** Inserts structured alerts into `legal_alerts` with `bit_conflict` flags. Updates `intelligence_items.legal_reviewed`.
**System prompt character:** Regulatory compliance monitor for the Myanmar diplomatic mission. Analysts legal/regulatory changes affecting bilateral trade.

---

## 8. Frontend Module Map

### 8.1 Design System **[PROTECTED]**
Do not alter these values without explicit instruction. The entire aesthetic depends on their consistency.

**Color tokens:**
```
--bg:       #0d1117   Page background
--surface:  #161b22   Card backgrounds
--surface2: #1c2333   Elevated surfaces, inputs
--border:   rgba(255,255,255,0.07)   Default borders
--border2:  rgba(255,255,255,0.13)   Hover/focus borders
--text:     #e6edf3   Primary text
--muted:    #8b949e   Secondary text, labels
--gold:     #c9a84c   Brand accent — actions, highlights ONLY
--gold-dim: rgba(201,168,76,0.14)    Gold tint surfaces
```

**Typography:**
```
Display:  Cormorant Garamond — section titles, page headings
Body:     DM Sans            — all prose, labels, UI copy
Data:     DM Mono            — timestamps, scores, badges, status indicators
Fallbacks: Georgia / Segoe UI / Consolas (for sandboxed environments)
```

**Status badge colours:**
```
ACTIVE / CONFIRMED / DELIVERED / BRIEFED   →  #4ade80 (green)
DRAFTING / READY                           →  #60a5fa (blue)
PENDING / QUEUED / IDLE                    →  #9ca3af (gray)
URGENT / CONFLICT                          →  #fb7185 (red/pink)
ALERT                                      →  #f97316 (orange)
HIGH priority border                       →  #f97316 (orange)
MEDIUM priority border                     →  #f59e0b (amber)
LOW priority border                        →  #4b5563 (dark gray)
```

**Animation keyframes:**
```
ep  — pulse (agent status dots): 0%,100% opacity:1 scale:1 → 50% opacity:0.4 scale:0.8
ef  — fade in (tab transitions): from opacity:0 translateY(7px) → to opacity:1
```

### 8.2 Navigation Tabs
```
CONSUL      →  dashboard tab    — Morning brief, inbox, agent fleet, command chat
SENTINEL    →  intelligence tab — Source grid, legal alerts, intelligence feed
ATTACHÉ     →  delegation tab   — Run-of-show, member cards, briefing progress
CONNECTOR   →  connector tab    — CRM stats, scored match cards, approve/dismiss
SCRIBE      →  scribe tab       — Commission interface, drafting queue, style profiles
```

### 8.3 Protected UI Flows **[PROTECTED]**

**Approve-before-send pattern** — three states, always implemented the same way:
```
PENDING  →  Show primary "Approve" button + secondary "Edit/Dismiss" button
APPROVED →  Replace buttons with green "✓ [ACTION] — [agent] notified" text + timestamp
DECLINED →  Archive item, no outbound action, optional note
```
This pattern applies to: inbox drafts, match introductions, intelligence action prompts, delegation schedule conflicts, Scribe draft reviews. It is the platform's defining UX constraint — apply it identically everywhere.

**Task polling** — Scribe tab polls `GET /api/tasks` every 10 seconds via `setInterval`. Status transitions appear automatically: `QUEUED → DRAFTING → DELIVERED`. Do not replace this with WebSocket until explicitly instructed.

**Priority bars** — 3px left border on all intelligence and inbox cards:
```
high   →  #f97316
medium →  #f59e0b
low    →  #4b5563
```

### 8.4 Key Component Patterns
When adding new features, match these existing patterns exactly:

```tsx
// Section label — always uppercase, gold, mono, letter-spaced
<SLabel>◈ Section Name</SLabel>

// Card container
<Card style={{ padding: "14px 16px" }}>...</Card>

// Badges — never hand-roll, always use Badge/StatusBadge components
<Badge label="BILATERAL" color="#60a5fa" />
<StatusBadge status="urgent" />

// Primary action button
<Btn>Approve Intro</Btn>

// Ghost/secondary button
<Btn variant="ghost">View Profile</Btn>

// Priority indicator on cards
<PriorityBar priority="high" />
```

---

## 9. Key Workflows — End-to-End

### 9.1 Morning Brief Generation **[PROTECTED]**
```
1. node-cron fires Sentinel at SENTINEL_CRON_INTERVAL
2. Sentinel fetches all active sources via Promise.allSettled
3. Each new item → Gemini classification with Myanmar–India bilateral prompt
4. Keyword post-processing escalates priority if Myanmar-context keywords found
5. Rows inserted into intelligence_items table
6. Frontend Dashboard polls GET /api/intelligence on load
7. Morning Brief renders items ordered by priority, flagged items surface action prompts
8. Diplomat approves action prompt → sets approved_at, logs to audit_log
```

### 9.2 Scribe Report Commission **[PROTECTED]**
```
1. Diplomat enters instruction in Scribe tab textarea, clicks Commission
2. POST /api/tasks → row inserted with status: "in_progress", progress: 0
3. HTTP response returns task ID immediately (non-blocking)
4. Background async job calls Gemini with Scribe system prompt + instruction
5. On completion: task row updated, status: "delivered", progress: 100, payload.draft set
6. Frontend 10s poll detects status change → card updates to DELIVERED
7. Diplomat clicks "Review Draft" → reads full draft in payload.draft
```

### 9.3 Trade Match Introduction **[PROTECTED]**
```
1. Connector cron runs or new entity triggers runConnector()
2. All unmatched home × local entity pairs scored via Gemini (batches of 5)
3. URGENT override applied if entity matches recent flagged intelligence
4. Rows inserted to matches table (score ≥ 60 only)
5. Frontend Connector tab shows scored cards ordered by score desc
6. Diplomat reviews score + rationale → clicks "Approve Intro"
7. POST /api/matches/:id/approve → sets approved_at, status: "actioned"
8. Logged to audit_log — intro queued for send (actual send not yet implemented)
```

### 9.4 Priority Inbox Triage & Drafting **[PROTECTED]**
```
1. Inbox cron runs runInboxSync()
2. Gmail API fetches unread emails from the last 24 hours
3. Gemini classifies each new email by urgency, category, and draft requirements
4. Email inserted into inbox_items with status: "pending"
5. If requires_draft is true, runScribeJob() is triggered automatically
6. Scribe generates "email_reply" format draft and resolves
7. Inbox agent reads drafted payload and updates inbox_items.draft_body
8. Diplomat reviews email in UI and clicks Approve to action (sending not yet implemented)
```

### 9.5 Intelligence-to-Action Escalation
```
1. Sentinel flags item with flag: true, action: "Alert Connector"
2. Morning Brief surfaces action prompt on flagged card
3. Diplomat approves → approve() called client-side, approved state tracked
4. (Future) Approved action triggers Connector run for relevant entities
```

### 9.6 Attaché Schedule & Briefing Setup
```
1. Attaché cron runs runAttacheSync() and fetches Google Calendar events
2. Groups consecutive items mentioning delegation or official visit
3. Upserts schedule into delegation_events, marks overlaps as conflicts
4. Automatically commissions The Scribe for unbriefed delegation members
5. Diplomat clicks Resolve Conflict in Dashboard, updating schedule to confirmed
```

### 9.7 Consul Command Routing
```
1. Diplomat submits instruction via chat interface
2. runConsulCommand injects system state into Gemini context (pending tasks, today's date)
3. Gemini classifies intent to one of 8 actions (e.g. COMMISSION_SCRIBE, RUN_SENTINEL)
4. Fastify handler runs appropriate agent function/DB query synchronously or async
5. Diplomat receives rich summarized data and a 1-click Approval chip to finalize execution
```

### 9.8 Sentinel-Legal Regulatory Alert Workflow
```
1. Sentinel-Legal cron runs hourly after Sentinel completes
2. Scans recent unevaluated intelligence_items for REGULATORY or BILATERAL tags
3. Evaluates impact and cross-references against active home entities' sectors
4. Inserts parsed alert to legal_alerts, marks intelligence item legal_reviewed
5. Dashboard surfaces highest-severity unactioned alert with optional BIT CONFLICT badge
6. Diplomat flags to briefing book, automatically generating a Scribe task for delegation context
```

---

## 10. Development Rules for Coding Agents

### Always Do
- Read this entire file before starting any implementation task
- Match existing code patterns exactly — component names, prop shapes, variable naming
- Add `bilateral_relevance` field handling whenever touching `intelligence_items`
- Use `zod` validation on every new API endpoint request body
- Set `approved_at` on every approval action — never null-skip it
- Write to `audit_log` for every agent action with a `reasoning_trace`
- Use `Promise.allSettled` for parallel external fetches — never `Promise.all`
- Use sequential `await` for batched LLM calls — never `Promise.all`
- Return task/job IDs immediately from endpoints — all LLM work is async background
- Test that failing LLM calls set `status: "failed"` without crashing the server

### Never Do
- Send any outbound communication without checking `approved_at IS NOT NULL`
- Add `UPDATE` or `DELETE` operations on `audit_log`
- Use `ON DELETE CASCADE` on the `matches` table
- Add `localStorage` or `sessionStorage`
- Hard-couple any feature to a specific LLM provider (keep model calls behind agent modules)
- Change the color tokens, typography, or animation keyframes without explicit instruction
- Modify the approve-before-send pattern — it is the platform's core UX contract
- Replace the 10-second polling with WebSocket unless explicitly instructed
- `Promise.all` LLM calls — always batch sequentially to respect rate limits
- Introduce new npm dependencies without listing them in a code comment explaining why

### Adding New Features
1. Check if a DB column, table, or endpoint already exists before creating a new one
2. New agents follow the pattern: `src/agents/{name}.ts` exports a `run{Name}()` function
3. New endpoints follow REST conventions in Section 6 — consistent response wrapper
4. New UI components extend the existing design tokens and component patterns in Section 8
5. Update Section 3 (Build Status) and Section 9 (Workflows) in this file when done

---

## 11. File Structure

```
/
├── src/
│   ├── agents/
│   │   ├── sentinel.ts       ✅ Live — RSS ingestion, Gemini classification
│   │   ├── scribe.ts         ✅ Live — LLM drafting, background jobs
│   │   ├── connector.ts      ✅ Live — scoring engine, match generation
│   │   ├── attache.ts        ⬜ Planned
│   │   └── consul.ts         ⬜ Planned
│   ├── db/
│   │   ├── schema.sql        ✅ Full schema with enums, triggers, indexes
│   │   ├── seed.ts           ✅ Initial mission dataset
│   │   └── migrations/       ✅ Alter table scripts
│   ├── routes/               ✅ All API route handlers
│   ├── App.tsx               ✅ React root, tab routing
│   ├── components/           ✅ Shared UI components
│   └── server.ts             ✅ Fastify server, cron setup, agent wiring
├── docker-compose.yml        ✅
├── .env.example              ✅
├── package.json              ✅
├── tsconfig.json             ✅
└── ENVOY-PROJECT-SPEC.md     ← this file
```

---

## 12. Roadmap Reference

| Phase | Scope | Status |
|---|---|---|
| 1 | React prototype, all 5 modules, mock data, design system | ✅ Complete |
| 2 | PostgreSQL schema, Fastify API, seed data, Docker, audit trail | ✅ Complete |
| 3 | Agent LLM integration: Sentinel, Scribe, Connector, Attaché, Consul | ✅ Complete |
| 4 | Auth + RBAC, sovereign/on-premise deployment config, self-hosted LLM option, M365 integration | ⬜ Planned |
| 5 | Events Engine full lifecycle, voice memo ingestion, mobile-optimised build, automated nurture sequences | ⬜ Planned |

**Immediate next steps (Phase 4):**
1. Implement Firebase/RBAC robust authentication flow
2. Sovereign M365 deployment configuration
3. Self-hosted LLM endpoints configuration

---

*ENVOY-PROJECT-SPEC.md · Version 1.4 · Updated after Phase 3 Step 7 (Sentinel-Legal live)*
*All coding agents: append version note and date when making spec updates.*