# Real-Time Data Integration Plan

This document outlines the step-by-step implementation plan for transitioning ENVOY from a mock-data prototype to a live, real-time diplomatic tool.

## Phase 1: Preparation & Planning

Before modifying the codebase, we must configure raw data feeds and external API access.

- [ ] **Identify Intelligence Sources (Sentinel)**
  - [ ] Gather a list of minimum 3-5 reliable RSS feeds or API endpoints relevant to India/Myanmar relations.
  - [ ] *Examples*: Google News RSS (Myanmar Economy), Reserve Bank of India Press Releases, Ministry of Commerce updates.
- [ ] **Determine Calendar System (Attaché)**
  - [ ] Identify the primary calendar system used by the Consul General (e.g., Google Workspace Calendar, Microsoft Outlook/Exchange).
  - [ ] Set up a developer account and project for the chosen provider.
- [ ] **Determine Email System (Inbox)**
  - [ ] Identify if we are connecting to a live inbox via IMAP/Gmail API, or using an inbound webhook parser (e.g., SendGrid/Resend).
  - [ ] Secure test credentials for the inbox.
- [ ] **Provision Authentication and Secrets**
  - [ ] Generate OAuth credentials/API tokens for calendar and email access.
  - [ ] Add the credentials securely to the `.env` file.

## Phase 2: Implementation (Module by Module)

### Step 1: Real-Time Intelligence (The Sentinel)
Transition from a hardcoded CNBC feed to localized, dynamic RSS polling.

- [x] **Update Feed Parsing Logic**
  - [x] Modify `src/agents/sentinel.ts` to accept an array of localized RSS feed URLs instead of a single hardcoded URL.
  - [x] Implement an asynchronous feed aggregator to fetch from all sources concurrently.
- [x] **Automate Polling**
  - [x] Set up a periodic background job (e.g., `node-cron`) in `server.ts` to execute the Sentinel agent every 1-2 hours.
- [x] **Data Pipeline Enhancements**
  - [x] Ensure robust deduplication logic in the SQLite database based on article `guid` and source URL.
  - [x] Add an "origin" field to track which feed the intelligence originated from.

### Step 2: Live Calendar Integration (The Attaché)
Replace the hardcoded "Run of Show" and "Appointments" with live schedule data.

- [ ] **Install API Clients**
  - [ ] Install required SDKs (e.g., `googleapis` or `@microsoft/microsoft-graph-client`).
- [ ] **Implement Calendar Fetching**
  - [ ] Create a new service function in `src/agents/attache.ts` that authenticates and fetches "Today's Events" from the target calendar.
- [ ] **Data Transformation**
  - [ ] Map the external calendar event schema (Title, Start Time, End Time, Location, Attendees) into the existing `delegation_events` table schema or pass it directly to the Attaché agent for processing.
- [ ] **Update Frontend Component**
  - [ ] Update `App.tsx` Attaché tab to dynamically render the fetched calendar data instead of the static mock array.

### Step 3: Dynamic Entity Management (The Connector)
Transition from hardcoded CLI seeding (`npm run seed`) to a user-driven CRM input mechanism.

- [ ] **Build CRM Input Component**
  - [ ] Create a new UI form in `App.tsx` (perhaps a modal or a new sub-tab) allowing users to manually input a new Entity (Name, Type [Home/Local], Sector, Objectives).
- [ ] **Create Entity API Endpoints**
  - [ ] Add `POST /api/entities` to `server.ts` to handle incoming data from the new form and save it to SQLite.
- [ ] **Automate Connector Trigger**
  - [ ] Modify the `POST /api/entities` route to automatically trigger the `runConnector()` function whenever a new entity is added, ensuring real-time matchmaking.

### Step 4: Live Email Parsing (Priority Inbox)
Replace simulated internal system notifications with real inbound communications.

- [ ] **Setup Inbound Email Parsing**
  - [ ] Configure the chosen inbound email solution (IMAP polling or Webhook receiver).
- [ ] **Create Email Ingestion Route**
  - [ ] Build a new endpoint (e.g., `POST /api/webhooks/email`) in `server.ts` to receive parsed email data.
- [ ] **Integrate Gemini Urgency Evaluation**
  - [ ] Process incoming email text against a prompt (similar to the Sentinel prompt) to determine "Urgency" and extracting key details (Subject, Sender, Org).
- [ ] **Database Insertion**
  - [ ] Insert the evaluated email payload into the `inbox_items` SQLite table.

## Phase 3: Testing & Polish

- [ ] **End-to-End Testing**
  - [ ] Verify that adding a new entity in the UI triggers the Connector to evaluate it against all existing entities.
  - [ ] Verify that a calendar event added to Google/Outlook appears in the Envoy UI within seconds/minutes.
  - [ ] Test the Sentinel feed aggregator logic to ensure it doesn't duplicate existing articles or exceed API rate limits.
- [ ] **Error Handling & Resilience**
  - [ ] Add retry mechanisms for external API calls (Calendar, RSS).
  - [ ] Add appropriate UI loading states (spinners/skeletons) while fetching live data.
