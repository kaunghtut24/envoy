-- ENVOY Platform Database Schema (PostgreSQL)

-- Enums
CREATE TYPE agent_name AS ENUM ('consul', 'sentinel', 'scribe', 'attache', 'connector', 'events', 'legal');
CREATE TYPE priority_level AS ENUM ('high', 'medium', 'low');
CREATE TYPE task_status AS ENUM ('queued', 'in_progress', 'delivered');
CREATE TYPE match_status AS ENUM ('queued', 'ready', 'urgent', 'actioned');
CREATE TYPE inbox_status AS ENUM ('pending', 'approved', 'declined');

-- Tables
CREATE TABLE diplomats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    mission TEXT NOT NULL,
    role TEXT NOT NULL,
    preferences JSONB DEFAULT '{}'
);

CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT CHECK (type IN ('home', 'local')),
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    hs_codes TEXT[], -- Array of HS codes
    size TEXT,
    objectives TEXT,
    relationship_status TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_entity_id UUID NOT NULL REFERENCES entities(id),
    local_entity_id UUID NOT NULL REFERENCES entities(id),
    score INTEGER CHECK (score >= 0 AND score <= 100),
    rationale TEXT,
    status match_status DEFAULT 'queued',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE relationship_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_entity_id UUID NOT NULL REFERENCES entities(id),
    local_entity_id UUID NOT NULL REFERENCES entities(id),
    event_type TEXT NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    next_action TEXT
);

CREATE TABLE intelligence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag TEXT NOT NULL,
    source TEXT NOT NULL,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    priority priority_level DEFAULT 'medium',
    flag BOOLEAN DEFAULT FALSE,
    action TEXT,
    published_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    legal_reviewed BOOLEAN DEFAULT FALSE
);

CREATE TABLE legal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id UUID REFERENCES intelligence_items(id),
  alert_type TEXT NOT NULL,
  affected_regulation TEXT NOT NULL,
  summary TEXT NOT NULL,
  affected_entity_ids UUID[],
  affected_sectors TEXT[],
  bit_conflict BOOLEAN DEFAULT false,
  bit_conflict_note TEXT,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  actioned BOOLEAN DEFAULT false,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent agent_name NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    status task_status DEFAULT 'queued',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    payload JSONB DEFAULT '{}',
    due_at TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent agent_name NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    reasoning_trace TEXT,
    diplomat_id UUID REFERENCES diplomats(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE delegation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    arrival TEXT NOT NULL,
    departure TEXT NOT NULL,
    members JSONB DEFAULT '[]',
    schedule JSONB DEFAULT '[]',
    briefing_progress INTEGER DEFAULT 0
);

CREATE TABLE inbox_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_name TEXT NOT NULL,
    from_org TEXT NOT NULL,
    subject TEXT NOT NULL,
    urgency priority_level DEFAULT 'medium',
    category TEXT NOT NULL,
    body TEXT,
    draft_body TEXT,
    status inbox_status DEFAULT 'pending',
    read BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Triggers for Audit Log (Prevent Update/Delete)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only. Updates and deletions are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
