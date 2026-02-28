import { Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "better-sqlite3";
import type { LLMClient } from "../services/llm.ts";

const ATTACHE_SYSTEM_PROMPT = `You are The Attaché, a logistics and delegation manager for the Myanmar Consulate in Kolkata, India.
You are given a current delegation itinerary and a list of incoming intelligence items or constraints.
Your job is to:
1. Review the schedule for any conflicts or risks based on the intelligence.
2. Update the status of schedule items ('ready' or 'alert').
3. If an alert is generated, explain why.

Return a JSON object matching this structure exactly:
{
  "updated_schedule": [
    {
      "time": "string (e.g., 09:00)",
      "event": "string",
      "agent": "string (agent name)",
      "status": "string (MUST BE exactly 'ready' or 'alert')",
      "alert_reason": "string or null"
    }
  ]
}
Return only valid JSON. No markdown.`;

export async function runAttache(db: Database, llmClient: LLMClient) {
    console.log("[Attaché] Starting delegation review...");

    try {
        // 1. Get the current active delegation (we'll just use the first one for this prototype)
        const delegation = db.prepare("SELECT * FROM delegation_events LIMIT 1").get();

        if (!delegation) {
            console.log("[Attaché] No active delegations found.");
            return;
        }

        const schedule = JSON.parse((delegation as any).schedule || "[]");

        // 2. Get recent high-priority intelligence that might affect logistics
        const intel = db.prepare("SELECT headline, tag FROM intelligence_items WHERE priority = 'high' ORDER BY ingested_at DESC LIMIT 5").all();

        const promptData = {
            current_schedule: schedule,
            recent_intelligence: intel
        };

        const prompt = JSON.stringify(promptData, null, 2);

        // 3. Ask Gemini to evaluate the schedule against the intelligence
        try {
            const resultText = await llmClient.generate(
                ATTACHE_SYSTEM_PROMPT,
                prompt,
                "application/json",
                {
                    type: Type.OBJECT,
                    properties: {
                        updated_schedule: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    time: { type: Type.STRING },
                                    event: { type: Type.STRING },
                                    agent: { type: Type.STRING },
                                    status: { type: Type.STRING },
                                    alert_reason: { type: Type.STRING, nullable: true }
                                },
                                required: ["time", "event", "agent", "status"]
                            }
                        }
                    },
                    required: ["updated_schedule"]
                }
            );

            const evaluation = JSON.parse(resultText);

            // 4. Update the database with the reviewed schedule
            db.prepare(`
        UPDATE delegation_events 
        SET schedule = ?
        WHERE id = ?
      `).run(
                JSON.stringify(evaluation.updated_schedule),
                (delegation as any).id
            );

            console.log(`[Attaché] Schedule review complete. Updated ${(delegation as any).name}.`);

        } catch (err) {
            console.error(`[Attaché] Failed to evaluate delegation:`, err);
        }

    } catch (error) {
        console.error("[Attaché] Error during delegation review:", error);
    }
}
