import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

const db = new Database("envoy.db");

// --- Database Initialization ---
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diplomats (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      mission TEXT NOT NULL,
      role TEXT NOT NULL,
      preferences TEXT
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT CHECK(type IN ('home', 'local')),
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      hs_codes TEXT, -- JSON array
      size TEXT,
      objectives TEXT,
      relationship_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      home_entity_id TEXT NOT NULL,
      local_entity_id TEXT NOT NULL,
      score INTEGER CHECK(score >= 0 AND score <= 100),
      rationale TEXT,
      status TEXT CHECK(status IN ('queued', 'ready', 'urgent', 'actioned')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(home_entity_id) REFERENCES entities(id),
      FOREIGN KEY(local_entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS relationship_events (
      id TEXT PRIMARY KEY,
      home_entity_id TEXT NOT NULL,
      local_entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      next_action TEXT,
      FOREIGN KEY(home_entity_id) REFERENCES entities(id),
      FOREIGN KEY(local_entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS intelligence_items (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      source TEXT NOT NULL,
      headline TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT CHECK(priority IN ('high', 'medium', 'low')),
      flag BOOLEAN DEFAULT 0,
      action TEXT,
      published_at TEXT,
      ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT CHECK(status IN ('queued', 'in_progress', 'delivered')),
      progress INTEGER DEFAULT 0,
      payload TEXT, -- JSON
      due_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload TEXT, -- JSON
      reasoning_trace TEXT,
      diplomat_id TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(diplomat_id) REFERENCES diplomats(id)
    );

    CREATE TABLE IF NOT EXISTS delegation_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      arrival TEXT NOT NULL,
      departure TEXT NOT NULL,
      members TEXT, -- JSON
      schedule TEXT, -- JSON
      briefing_progress INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      from_name TEXT NOT NULL,
      from_org TEXT NOT NULL,
      subject TEXT NOT NULL,
      urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),
      category TEXT NOT NULL,
      body TEXT,
      draft_body TEXT,
      status TEXT CHECK(status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
      read BOOLEAN DEFAULT 0,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration for diplomats auth
  try {
    db.exec(`ALTER TABLE diplomats ADD COLUMN email TEXT UNIQUE`);
    db.exec(`ALTER TABLE diplomats ADD COLUMN password_hash TEXT`);
  } catch (err: any) {
    if (!err.message.includes("duplicate column name")) {
      console.warn("Could not add auth columns to diplomats:", err.message);
    }
  }
}

async function seed() {
  console.log("Seeding database...");
  initDb();

  // Clear existing data
  db.exec("PRAGMA foreign_keys = OFF;");
  db.prepare("DROP TABLE IF EXISTS audit_log").run();
  db.prepare("DROP TABLE IF EXISTS diplomats").run();

  // Re-init so the new table structure with email/password_hash is created fresh
  initDb();

  db.prepare("DELETE FROM relationship_events").run();
  db.prepare("DELETE FROM inbox_items").run();
  db.prepare("DELETE FROM intelligence_items").run();
  db.prepare("DELETE FROM matches").run();
  db.prepare("DELETE FROM entities").run();
  db.prepare("DELETE FROM tasks").run();
  db.prepare("DELETE FROM delegation_events").run();
  db.exec("PRAGMA foreign_keys = ON;");

  // Seed Diplomat
  const diplomatId = uuidv4();
  const passwordHash = await bcrypt.hash("envoy-dev-2025", 12);

  db.prepare(`
    INSERT INTO diplomats (id, email, password_hash, name, mission, role, preferences)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    diplomatId,
    "attache@myanmar-mission.in",
    passwordHash,
    "Aung San",
    "Myanmar Consulate in Kolkata",
    "diplomat",
    JSON.stringify({ theme: "dark" })
  );

  // Seed Intelligence
  const intelligence = [
    {
      tag: "MONETARY POLICY",
      source: "Reserve Bank of India (RBI)",
      headline: "Unexpected rate hold at 6.50% — MPC split",
      body: "The Monetary Policy Committee held the benchmark repo rate against expectations of a cut. This signals a cautious approach to inflation in India, potentially impacting the cost of capital for Myanmar exporters seeking financing in Kolkata.",
      priority: "high",
      flag: 1,
      published_at: "2026-02-23T06:14:00Z"
    },
    {
      tag: "INVESTMENT OPPORTUNITY",
      source: "Economic Times",
      headline: "Adani Green Energy announces 500MW solar expansion in West Bengal",
      body: "The conglomerate's move into green infrastructure in West Bengal overlaps with Yangon Energy Group's investment mandate. Recommend flagging to Connector for relationship acceleration.",
      priority: "high",
      flag: 1,
      action: "Alert Connector",
      published_at: "2026-02-23T07:02:00Z"
    },
    {
      tag: "REGULATORY",
      source: "Ministry of Commerce and Industry, India",
      headline: "Draft revision to customs classification for pulses and beans",
      body: "Potential reclassification of HS codes affecting agricultural imports from Myanmar. Sentinel-Legal has begun cross-reference against active Myanmar exporter inquiries.",
      priority: "medium",
      flag: 0,
      published_at: "2026-02-23T05:48:00Z"
    }
  ];

  for (const item of intelligence) {
    db.prepare(`
      INSERT INTO intelligence_items (id, tag, source, headline, body, priority, flag, action, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), item.tag, item.source, item.headline, item.body, item.priority, item.flag, item.action || null, item.published_at);
  }

  // Seed Entities
  const entities = [
    { id: uuidv4(), type: "home", name: "Myanmar Agrotech", sector: "Agricultural Exports", size: "Large", objectives: "Market entry in West Bengal", relationship_status: "active" },
    { id: uuidv4(), type: "local", name: "Mahindra Tractors & Agri", sector: "Agricultural Input Distribution", size: "Large", objectives: "Seeking regional partners", relationship_status: "prospect" },
    { id: uuidv4(), type: "home", name: "Yangon Energy Group", sector: "Solar & Wind", size: "Medium", objectives: "JV partner search", relationship_status: "active" },
    { id: uuidv4(), type: "local", name: "Adani Green Energy", sector: "Energy & Infrastructure", size: "Large", objectives: "Expansion", relationship_status: "prospect" }
  ];

  for (const entity of entities) {
    db.prepare(`
      INSERT INTO entities (id, type, name, sector, size, objectives, relationship_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entity.id, entity.type, entity.name, entity.sector, entity.size, entity.objectives, entity.relationship_status);
  }

  // Seed Matches
  db.prepare(`
    INSERT INTO matches (id, home_entity_id, local_entity_id, score, rationale, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), entities[0].id, entities[1].id, 94, "India's agricultural machinery leader perfectly complements Myanmar Agrotech's export ambitions. Strong foundation for bilateral JV.", "ready");

  db.prepare(`
    INSERT INTO matches (id, home_entity_id, local_entity_id, score, rationale, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), entities[2].id, entities[3].id, 91, "NEW: Adani's massive solar expansion in WB presents an immediate contracting opportunity for Yangon Energy Group.", "urgent");

  // Seed Inbox
  const inbox = [
    { from_name: "Ministry of Commerce, India", from_org: "Government of India", subject: "Re: Bilateral Investment Framework — your questions", urgency: "high", category: "ministerial", draft_body: "Dear Consul General, thank you for your response. We have reviewed the proposed framework and...", received_at: "2026-02-23T07:44:00Z" },
    { from_name: "Daw Su Su", from_org: "Myanmar Agrotech", subject: "Seeking distribution partners in Kolkata — followup", urgency: "medium", category: "inquiry", draft_body: "Hello, we have identified several potential partners from the provided list...", received_at: "2026-02-23T06:55:00Z" },
    { from_name: "Protocol Office", from_org: "West Bengal State Government", subject: "Confirmed: Thursday delegation reception", urgency: "medium", category: "logistics", received_at: "2026-02-23T06:22:00Z" }
  ];

  for (const item of inbox) {
    db.prepare(`
      INSERT INTO inbox_items (id, from_name, from_org, subject, urgency, category, draft_body, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), item.from_name, item.from_org, item.subject, item.urgency, item.category, item.draft_body || null, item.received_at);
  }

  // Seed Tasks
  const tasks = [
    { title: "Kolkata SEZ Legislative Analysis", audience: "Myanmar Ministry of Foreign Affairs", progress: 100, status: "delivered", due: "Today" },
    { title: "Weekly Economic Sitrep on West Bengal", audience: "Home Ministry", progress: 60, status: "in_progress", due: "Friday" },
    { title: "Delegation Briefing Book", audience: "UMFCCI Trade Mission — 6 members", progress: 80, status: "in_progress", due: "Wednesday" }
  ];

  for (const task of tasks) {
    db.prepare(`
      INSERT INTO tasks (id, agent, type, title, status, progress, payload, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), "scribe", "report", task.title, task.status === "in_progress" ? "in_progress" : task.status, task.progress, JSON.stringify({ audience: task.audience }), task.due);
  }

  // Seed Delegation
  const delegationId = "chamber-2025";
  db.prepare(`
    INSERT INTO delegation_events (id, name, arrival, departure, members, schedule, briefing_progress)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    delegationId,
    "UMFCCI Trade Mission to Kolkata",
    "Thursday, 09:00",
    "Friday, 17:30",
    JSON.stringify([
      { name: "U Maung Maung", company: "Myanmar Conglomerate Group", sector: "Manufacturing", objective: "Distribution & licensing", briefed: true },
      { name: "Daw Su Su", company: "Myanmar Agrotech", sector: "Agriculture", objective: "Input supply chain", briefed: true },
      { name: "Ko Zaw", company: "Yangon Logistics", sector: "Logistics", objective: "Cross-border transport", briefed: true },
      { name: "U Kyaw", company: "Kyaw Financial Services", sector: "Finance", objective: "Letter of Credit facilitation", briefed: false },
      { name: "Daw Myat", company: "Yangon Energy Group", sector: "Energy", objective: "Solar components", briefed: false },
      { name: "U Htun", company: "Htun Legal Advisers", sector: "Legal", objective: "Export regulations", briefed: true }
    ]),
    JSON.stringify([
      { time: "09:30", event: "Welcome briefing — Consulate premises", status: "confirmed", agent: "attaché" },
      { time: "11:00", event: "West Bengal Board of Trade — bilateral roundtable", status: "confirmed", agent: "attaché" },
      { time: "13:00", event: "Working lunch — Bengal Chamber of Commerce", status: "confirmed", agent: "events" },
      { time: "15:00", event: "B2B matching sessions — 6 bilateral pairs", status: "alert", agent: "connector" },
      { time: "17:30", event: "Networking reception — Ambassador's Residence", status: "confirmed", agent: "events" },
      { time: "09:00", event: "Site visits — Special Economic Zone", status: "pending", agent: "attaché" },
      { time: "14:00", event: "Debrief & departure", status: "confirmed", agent: "attaché" }
    ]),
    80
  );

  console.log("Seeding complete.");
}

seed().catch(console.error);
