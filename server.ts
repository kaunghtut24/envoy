import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import cron from "node-cron";
import { formatScribePrompt } from "./src/agents/scribe.ts";
import { runSentinel } from "./src/agents/sentinel.ts";
import { runConnector } from "./src/agents/connector.ts";
import { runAttache } from "./src/agents/attache.ts";
import { runConsulRouting } from "./src/agents/consul.ts";
import { runInboxSync } from "./src/agents/inbox.ts";
import { runSentinelLegal } from "./src/agents/sentinel-legal.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("envoy.db");

// Gemini Initialization
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// --- Database Initialization ---
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diplomats (
      id TEXT PRIMARY KEY,
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
      ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      legal_reviewed BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS legal_alerts (
      id TEXT PRIMARY KEY,
      intelligence_item_id TEXT,
      alert_type TEXT NOT NULL,
      affected_regulation TEXT NOT NULL,
      summary TEXT NOT NULL,
      affected_entity_ids TEXT, -- JSON array
      affected_sectors TEXT, -- JSON array
      bit_conflict BOOLEAN DEFAULT 0,
      bit_conflict_note TEXT,
      severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
      actioned BOOLEAN DEFAULT 0,
      actioned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(intelligence_item_id) REFERENCES intelligence_items(id)
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

    -- Audit Log Trigger (Prevent Update/Delete)
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log
    BEGIN
      SELECT RAISE(FAIL, 'Updates not allowed on audit_log');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
      SELECT RAISE(FAIL, 'Deletions not allowed on audit_log');
    END;
  `);

  // Migration for legal_reviewed
  try {
    db.exec(`ALTER TABLE intelligence_items ADD COLUMN legal_reviewed BOOLEAN DEFAULT 0`);
  } catch (err: any) {
    if (!err.message.includes("duplicate column name")) {
      console.warn("Could not add legal_reviewed column:", err.message);
    }
  }
}

initDb();

// --- API Implementation ---
async function startServer() {
  const app = express();
  app.use(express.json());

  // Intelligence
  app.get("/api/intelligence", (req, res) => {
    const { priority, tag } = req.query;
    let query = "SELECT * FROM intelligence_items";
    const params: any[] = [];

    if (priority || tag) {
      query += " WHERE";
      if (priority) {
        query += " priority = ?";
        params.push(priority);
      }
      if (tag) {
        if (priority) query += " AND";
        query += " tag = ?";
        params.push(tag);
      }
    }
    query += " ORDER BY ingested_at DESC";

    const items = db.prepare(query).all(...params);
    res.json(items);
  });

  // Inbox
  app.get("/api/inbox", (req, res) => {
    const items = db.prepare("SELECT * FROM inbox_items ORDER BY received_at DESC").all();
    res.json(items);
  });

  app.post("/api/inbox/:id/approve", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE inbox_items SET status = 'approved', read = 1 WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.post("/api/inbox/:id/decline", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE inbox_items SET status = 'declined', read = 1 WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Entities
  app.get("/api/entities", (req, res) => {
    const { type } = req.query;
    let query = "SELECT * FROM entities";
    const params: any[] = [];
    if (type) {
      query += " WHERE type = ?";
      params.push(type);
    }
    query += " ORDER BY created_at DESC";
    const entities = db.prepare(query).all(...params);
    res.json(entities);
  });

  app.post("/api/entities", (req, res) => {
    const schema = z.object({
      type: z.enum(['home', 'local']),
      name: z.string(),
      sector: z.string(),
      size: z.string().optional(),
      objectives: z.string().optional(),
      hs_codes: z.array(z.string()).optional()
    });

    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const id = uuidv4();
    const { type, name, sector, size, objectives, hs_codes } = result.data;

    db.prepare(`
      INSERT INTO entities (id, type, name, sector, size, objectives, hs_codes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      type,
      name,
      sector,
      size || null,
      objectives || null,
      hs_codes ? JSON.stringify(hs_codes) : '[]'
    );

    // Call runConnector asynchronously to not block the request
    runConnector(db, genAI).catch(err => console.error("[Connector] Auto-run failed:", err));

    res.json({ id });
  });

  // Matches
  app.get("/api/matches", (req, res) => {
    const matches = db.prepare(`
      SELECT m.*, e1.name as home_entity_name, e2.name as local_entity_name, 
             e1.sector as home_sector, e2.sector as local_sector
      FROM matches m
      JOIN entities e1 ON m.home_entity_id = e1.id
      JOIN entities e2 ON m.local_entity_id = e2.id
      ORDER BY m.created_at DESC
    `).all();
    res.json(matches);
  });

  app.post("/api/matches/:id/approve", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE matches SET status = 'actioned' WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Delegation
  app.get("/api/delegation/:id", (req, res) => {
    const { id } = req.params;
    const delegation = db.prepare("SELECT * FROM delegation_events WHERE id = ?").get(id);
    if (delegation) {
      delegation.members = JSON.parse(delegation.members);
      delegation.schedule = JSON.parse(delegation.schedule);
    }
    res.json(delegation);
  });

  // Tasks
  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    res.json(tasks);
  });

  async function runScribeJob(taskId: string, instruction: string, payload: any) {
    try {
      console.log(`[Scribe] Starting job for task ${taskId}`);

      const params = {
        audience: payload.audience || "Myanmar Ministry of Foreign Affairs",
        format: payload.format || "formal report",
        pages: payload.pages || 2,
        instruction: instruction
      };

      const systemInstruction = formatScribePrompt(params);

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        config: {
          systemInstruction: systemInstruction
        }
      });

      const draft = result.text;

      db.prepare(`
        UPDATE tasks 
        SET status = 'delivered', progress = 100, payload = ?
        WHERE id = ?
      `).run(JSON.stringify({ ...payload, draft }), taskId);

      console.log(`[Scribe] Completed job for task ${taskId}`);
    } catch (error) {
      console.error(`[Scribe] Job failed for task ${taskId}:`, error);
      db.prepare(`
        UPDATE tasks 
        SET status = 'queued', progress = 0
        WHERE id = ?
      `).run(taskId);
    }
  }

  app.post("/api/tasks", (req, res) => {
    const schema = z.object({
      agent: z.string(),
      type: z.string(),
      title: z.string(),
      payload: z.any().optional(),
      due_at: z.string().optional(),
      instruction: z.string().optional(), // Added for Scribe
    });

    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const id = uuidv4();
    const { agent, type, title, payload, due_at, instruction } = result.data;

    const status = agent === 'scribe' ? 'in_progress' : 'queued';

    db.prepare(`
      INSERT INTO tasks (id, agent, type, title, status, progress, payload, due_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, agent, type, title, status, JSON.stringify(payload || {}), due_at || null);

    if (agent === 'scribe') {
      // Fire and forget background job
      runScribeJob(id, instruction || title, payload || {});
    }

    res.json({ id });
  });

  // Audit
  app.post("/api/audit", (req, res) => {
    const schema = z.object({
      agent: z.string(),
      action_type: z.string(),
      payload: z.any().optional(),
      reasoning_trace: z.string().optional(),
      diplomat_id: z.string().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const id = uuidv4();
    const { agent, action_type, payload, reasoning_trace, diplomat_id } = result.data;

    db.prepare(`
      INSERT INTO audit_log (id, agent, action_type, payload, reasoning_trace, diplomat_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, agent, action_type, JSON.stringify(payload || {}), reasoning_trace || null, diplomat_id || null);

    res.json({ id });
  });

  // Agent Status
  app.get("/api/agents/status", (req, res) => {
    // Mocking live status for the 6 agents
    const agents = [
      { id: "consul", status: "active", tasks: 0 },
      { id: "sentinel", status: "active", tasks: 0 },
      { id: "scribe", status: "active", tasks: 0 },
      { id: "attache", status: "active", tasks: 0 },
      { id: "connector", status: "idle", tasks: 0 },
      { id: "legal", status: "alert", tasks: 0 },
    ];
    res.json(agents);
  });

  // Sentinel Manual Run
  app.get("/api/agents/sentinel/run", async (req, res) => {
    await runSentinel(db, genAI);
    res.json({ status: "Sentinel run completed" });
  });

  // Attaché Manual Run
  app.get("/api/agents/attache/run", async (req, res) => {
    await runAttache(db, genAI);
    res.json({ status: "Attaché run completed" });
  });

  // Connector Manual Run
  app.get("/api/agents/connector/run", async (req, res) => {
    await runConnector(db, genAI);
    res.json({ status: "Connector run completed" });
  });

  // Inbox Manual Run
  app.get("/api/agents/inbox/run", async (req, res) => {
    await runInboxSync(db, genAI, runScribeJob);
    res.json({ status: "Inbox sync completed" });
  });

  // Sentinel-Legal Manual Run
  app.get("/api/agents/sentinel-legal/run", async (req, res) => {
    await runSentinelLegal(db, genAI);
    res.json({ status: "Sentinel-Legal run completed" });
  });

  // Sentinel Legal Alerts Endpoints
  app.get("/api/legal-alerts", (req, res) => {
    const { severity, actioned } = req.query;
    let query = "SELECT * FROM legal_alerts";
    const params: any[] = [];
    let conditions = [];

    if (severity) {
      conditions.push("severity = ?");
      params.push(severity);
    }

    // Default to actioned=false if not specified
    const isActioned = actioned === "true" ? 1 : 0;
    conditions.push("actioned = ?");
    params.push(isActioned);

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY created_at DESC";

    const alerts = db.prepare(query).all(...params);
    res.json(alerts);
  });

  app.post("/api/legal-alerts/:id/action", (req, res) => {
    const schema = z.object({
      note: z.string().optional()
    });

    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const { id } = req.params;

    db.prepare(`
      UPDATE legal_alerts 
      SET actioned = 1, actioned_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);

    // Provide audit log entry
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, agent, action_type, payload, reasoning_trace)
      VALUES (?, 'legal', 'action_alert', ?, ?)
    `).run(auditId, JSON.stringify({ alert_id: id, note: result.data.note }), "User manually actioned legal alert.");

    res.json({ success: true });
  });

  // Consul Command Routing
  app.post("/api/consul/route", async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "Command is required" });

    const routeData = await runConsulRouting(command, genAI);

    // Automatically trigger the relevant agent if applicable
    try {
      if (routeData.agent === "sentinel") {
        runSentinel(db, genAI);
      } else if (routeData.agent === "connector") {
        runConnector(db, genAI);
      } else if (routeData.agent === "attache") {
        runAttache(db, genAI);
      } else if (routeData.agent === "scribe") {
        // Scribe requires a specific payload format that we don't have from just a quick prompt
        // but for demo purposes, we can queue a generic task if they just ask for it.
        const id = uuidv4();
        db.prepare(`
          INSERT INTO tasks (id, agent, type, title, status, progress, payload)
          VALUES (?, 'scribe', 'report', ?, 'queued', 0, '{}')
        `).run(id, routeData.intent || "Unknown Report");
      }
    } catch (e) {
      console.error("[Consul] Error triggering agent:", e);
    }

    res.json(routeData);
  });

  // Database Diagnostics (Admin View)
  app.get("/api/db/diagnostics", (req, res) => {
    try {
      const dbStats = {
        entities: db.prepare("SELECT COUNT(*) as count FROM entities").get(),
        matches: db.prepare("SELECT COUNT(*) as count FROM matches").get(),
        intelligence: db.prepare("SELECT COUNT(*) as count FROM intelligence_items").get(),
        tasks: db.prepare("SELECT COUNT(*) as count FROM tasks").get(),
        inbox: db.prepare("SELECT COUNT(*) as count FROM inbox_items").get()
      };

      const recentData = {
        entities: db.prepare("SELECT * FROM entities ORDER BY created_at DESC LIMIT 5").all(),
        matches: db.prepare("SELECT * FROM matches ORDER BY created_at DESC LIMIT 5").all(),
        tasks: db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 5").all()
      };

      res.json({ stats: dbStats, data: recentData });
    } catch (e) {
      console.error("[DB Diagnostics] Error fetching stats:", e);
      res.status(500).json({ error: "Failed to fetch DB diagnostics" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Start Sentinel
    const sentinelInterval = process.env.SENTINEL_CRON_INTERVAL || "0 * * * *"; // Run at minute 0 past every hour
    console.log(`[Sentinel] Scheduling with interval: ${sentinelInterval}`);

    try {
      cron.schedule(sentinelInterval, () => {
        console.log("[Sentinel] Triggering scheduled run...");
        runSentinel(db, genAI)
          .then(() => runSentinelLegal(db, genAI).catch(err => console.error("[Sentinel-Legal] Scheduled run failed:", err)))
          .catch(err => console.error("[Sentinel] Scheduled run failed:", err));
      });

      // Initial run with delay to ensure server is up (Wait 5 seconds instead of 10)
      setTimeout(() => {
        console.log("[Sentinel] Triggering initial run...");
        runSentinel(db, genAI)
          .then(() => runSentinelLegal(db, genAI).catch(err => console.error("[Sentinel-Legal] Initial run failed:", err)))
          .catch(err => console.error("[Sentinel] Initial run failed:", err));
      }, 5000);
    } catch (error) {
      console.error("[Sentinel] Failed to schedule:", error);
    }

    // Start Inbox Sync
    const inboxInterval = process.env.INBOX_CRON_INTERVAL || "0 */2 * * *"; // Every 2 hours
    console.log(`[Inbox] Scheduling with interval: ${inboxInterval}`);

    try {
      cron.schedule(inboxInterval, () => {
        console.log("[Inbox] Triggering scheduled sync...");
        runInboxSync(db, genAI, runScribeJob).catch(err => console.error("[Inbox] Scheduled sync failed:", err));
      });

      // Initial run with delay
      setTimeout(() => {
        console.log("[Inbox] Triggering initial sync...");
        runInboxSync(db, genAI, runScribeJob).catch(err => console.error("[Inbox] Initial sync failed:", err));
      }, 8000);
    } catch (error) {
      console.error("[Inbox] Failed to schedule:", error);
    }
  });
}

startServer();
