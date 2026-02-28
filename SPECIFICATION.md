# Envoy - Economic Intelligence Platform Specification

## 1. Overview
Envoy is an AI-powered economic intelligence platform designed for diplomatic missions. It orchestrates a fleet of specialized AI agents to monitor, analyze, and act on economic data, facilitating trade matchmaking, reporting, and delegation management.

## 2. Architecture
- **Frontend:** React (Vite), Tailwind CSS, Framer Motion (animations), Lucide React (icons).
- **Backend:** Node.js (Express), Better-SQLite3 (Database), Google Gemini API (LLM).
- **Database:** SQLite (`envoy.db`) with a schema optimized for agent tasks and intelligence data.
- **Scheduling:** `node-cron` for periodic agent tasks.

## 3. Agents
The system is built around six specialized agents:

### 3.1. The Consul (Orchestrator)
- **Role:** Master Orchestrator & Interface.
- **Function:** Manages the user interface, routes commands to other agents, and provides a unified dashboard.
- **Status:** Active.

### 3.2. The Sentinel (Intelligence & Monitoring)
- **Role:** Economic Intelligence Monitoring.
- **Function:** Monitors external data sources for relevant economic news and events.
- **Implementation:** `src/agents/sentinel.ts`
- **Data Source:** World Bank RSS Feed.
- **Process:**
    1.  Fetches RSS feed on a schedule (default: every 30 mins).
    2.  Deduplicates items against `intelligence_items` table.
    3.  Uses Gemini (`gemini-2.5-flash`) to summarize and tag items.
    4.  Stores structured intelligence (tag, priority, flag, action) in the database.
- **Status:** Active.

### 3.3. The Scribe (Reporting & Drafting)
- **Role:** Diplomatic Writer.
- **Function:** Drafts formal reports, briefs, and analysis documents.
- **Implementation:** `src/agents/scribe.ts`
- **Process:**
    1.  Receives task instructions via `POST /api/tasks`.
    2.  Uses Gemini (`gemini-2.5-flash`) with a specialized system prompt to generate content.
    3.  Updates task status and payload with the generated draft.
- **Status:** Active.

### 3.4. The Attaché (Delegation & Logistics)
- **Role:** Logistics Manager.
- **Function:** Manages delegation schedules, member briefings, and logistics.
- **Status:** Active (Mock data/Prototype).

### 3.5. The Connector (Trade Matchmaking)
- **Role:** CRM & Matchmaker.
- **Function:** Identifies and scores potential trade partners.
- **Status:** Idle (Mock data/Prototype).

### 3.6. Sentinel-Legal (Regulatory & Compliance)
- **Role:** Legal Analyst.
- **Function:** Monitors regulatory changes and compliance issues.
- **Status:** Alert (Mock data/Prototype).

## 4. Data Model (SQLite)

### `diplomats`
- Diplomat profiles and preferences.

### `entities`
- Companies and organizations (Home & Local).

### `matches`
- Trade matches between entities with scores and rationale.

### `relationship_events`
- History of interactions between entities.

### `intelligence_items`
- Structured economic news and intelligence.
- Fields: `tag`, `source`, `headline`, `body`, `priority`, `flag`, `action`, `published_at`, `ingested_at`.

### `tasks`
- Asynchronous tasks for agents (e.g., Scribe drafting).
- Fields: `agent`, `type`, `title`, `status`, `progress`, `payload`, `due_at`.

### `audit_log`
- Immutable log of agent actions and approvals.

### `delegation_events`
- Schedule and logistics for delegations.

### `inbox_items`
- Messages and notifications for the diplomat.

## 5. API Endpoints

### Intelligence
- `GET /api/intelligence`: Fetch intelligence items (supports filtering by priority/tag).

### Inbox
- `GET /api/inbox`: Fetch inbox items.
- `POST /api/inbox/:id/approve`: Approve an inbox item.
- `POST /api/inbox/:id/decline`: Decline an inbox item.

### Matches
- `GET /api/matches`: Fetch trade matches.
- `POST /api/matches/:id/approve`: Approve a match introduction.

### Delegation
- `GET /api/delegation/:id`: Fetch delegation details.

### Tasks
- `GET /api/tasks`: Fetch active tasks.
- `POST /api/tasks`: Create a new task (triggers Scribe agent if applicable).

### Audit
- `POST /api/audit`: Log an action.

### Agents
- `GET /api/agents/status`: Get status of all agents.
- `GET /api/agents/sentinel/run`: Manually trigger the Sentinel agent.

## 6. Configuration
- **Environment Variables:**
    - `GEMINI_API_KEY`: API key for Google Gemini.
    - `SENTINEL_CRON_INTERVAL`: Cron schedule for Sentinel (default: `*/30 * * * *`).
- **Ports:**
    - App runs on port `3000`.

## 7. Future Roadmap
- Implement real data sources for Connector and Attaché.
- Enhance Scribe with document templates and export options.
- Add user authentication and multi-user support.
- Expand Sentinel sources beyond World Bank.
