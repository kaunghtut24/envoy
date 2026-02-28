import { Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { LLMClient } from "../services/llm.ts";

const CONSUL_SYSTEM_PROMPT = `You are The Consul, the master orchestrator for the ENVOY AI system at the Myanmar Consulate in Kolkata, India.
The user will give you a natural language command. Your job is to determine which of our specialized agents is best suited to handle the request.

Available Agents:
- "scribe": For drafting reports, emails, memos, or any written analysis.
- "connector": For finding trade partners, matchmaking, or CRM tasks.
- "attache": For managing delegation schedules, logistics, and personnel.
- "sentinel": For fetching new economic intelligence or monitoring news.
- "legal": For regulatory or compliance analysis.
- "none": If it's just a general question or doesn't fit the above.

Return a JSON object matching this structure exactly:
{
  "agent": "string (one of the options above)",
  "intent": "string (short summary of what the user wants)",
  "response": "string (a direct, professional response acknowledging the routing decision, e.g., 'Routing to The Scribe. Task parameters received...')"
}
Return only valid JSON. No markdown.`;

export async function runConsulRouting(instruction: string, diplomat_id: string, db: any, llmClient: LLMClient) {
    try {
        const resultText = await llmClient.generate(
            CONSUL_SYSTEM_PROMPT,
            instruction,
            "application/json",
            {
                type: Type.OBJECT,
                properties: {
                    agent: { type: Type.STRING },
                    intent: { type: Type.STRING },
                    response: { type: Type.STRING }
                },
                required: ["agent", "intent", "response"]
            }
        );

        const parsed = JSON.parse(resultText);

        // Audit the routing decision
        db.prepare(`
            INSERT INTO audit_log (id, agent, action_type, payload, reasoning_trace, diplomat_id)
            VALUES (?, 'consul', 'command', ?, ?, ?)
        `).run(uuidv4(), JSON.stringify({ instruction, routing: parsed }), JSON.stringify(parsed), diplomat_id);

        return parsed;
    } catch (error) {
        console.error("[Consul] Error during routing:", error);
        return {
            agent: "none",
            intent: instruction,
            response: "I encountered an error while trying to process your command. Please try again."
        };
    }
}
