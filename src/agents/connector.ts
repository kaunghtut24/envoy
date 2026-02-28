import { Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "better-sqlite3";
import type { LLMClient } from "../services/llm.ts";

const CONNECTOR_SYSTEM_PROMPT = `You are The Connector, an expert trade matchmaker for the Myanmar Consulate in Kolkata, India.

Your job is to read profiles of "home" entities (organizations from Myanmar) and "local" entities (organizations in India).

You will be provided with a JSON array of entities. The first entity will be a "home" entity, and the second will be a "local" entity.

Return a JSON object with exactly these fields:
{
  "score": integer (0 to 100, representing the strength of the match based on sectors, size, and objectives),
  "rationale": string (2-3 sentences explaining Why they are a good match and What the next step should be)
}
Return only valid JSON. No markdown, no explanation.`;

export async function runConnector(db: Database, llmClient: LLMClient) {
    console.log("[Connector] Starting matchmaking analysis...");

    try {
        // 1. Fetch entities that haven't been matched yet
        // For simplicity in this demo, let's just grab all home entities and local entities
        // and try to find high-value pairs.
        const homeEntities = db.prepare("SELECT * FROM entities WHERE type = 'home'").all();
        const localEntities = db.prepare("SELECT * FROM entities WHERE type = 'local'").all();

        if (homeEntities.length === 0 || localEntities.length === 0) {
            console.log("[Connector] Not enough entities to perform matchmaking.");
            return;
        }

        // Process a few combinations (limited to avoid huge API calls in demo)
        let matchesFound = 0;

        // Let's just do a cross-join of the first 3 home and first 3 local to find top matches
        const hSubset = homeEntities.slice(0, 3);
        const lSubset = localEntities.slice(0, 3);

        for (const home of hSubset) {
            for (const local of lSubset) {

                // Skip if match already exists
                const existingMatch = db.prepare("SELECT id FROM matches WHERE home_entity_id = ? AND local_entity_id = ?").get((home as any).id, (local as any).id);
                if (existingMatch) continue;

                console.log(`[Connector] Analyzing pair: ${(home as any).name} <-> ${(local as any).name}`);

                const promptData = [
                    {
                        name: (home as any).name,
                        sector: (home as any).sector,
                        size: (home as any).size,
                        objectives: (home as any).objectives
                    },
                    {
                        name: (local as any).name,
                        sector: (local as any).sector,
                        size: (local as any).size,
                        objectives: (local as any).objectives
                    }
                ];

                const prompt = JSON.stringify(promptData, null, 2);

                try {
                    const resultText = await llmClient.generate(
                        CONNECTOR_SYSTEM_PROMPT,
                        prompt,
                        "application/json",
                        {
                            type: Type.OBJECT,
                            properties: {
                                score: { type: Type.INTEGER },
                                rationale: { type: Type.STRING }
                            },
                            required: ["score", "rationale"]
                        }
                    );

                    const matchResult = JSON.parse(resultText);

                    // Only save good matches (score > 60)
                    if (matchResult.score > 60) {
                        db.prepare(`
              INSERT INTO matches (id, home_entity_id, local_entity_id, score, rationale, status)
              VALUES (?, ?, ?, ?, ?, 'queued')
            `).run(
                            uuidv4(),
                            (home as any).id,
                            (local as any).id,
                            matchResult.score,
                            matchResult.rationale
                        );
                        console.log(`[Connector] Saved strong match (${matchResult.score}/100) for ${(home as any).name} & ${(local as any).name}`);
                        matchesFound++;
                    } else {
                        console.log(`[Connector] Discarding weak match (${matchResult.score}/100) for ${(home as any).name} & ${(local as any).name}`);
                    }

                } catch (err) {
                    console.error(`[Connector] Failed to analyze pair:`, err);
                }
            }
        }

        console.log(`[Connector] Matchmaking complete. Found ${matchesFound} new matches.`);
    } catch (error) {
        console.error("[Connector] Error during matchmaking:", error);
    }
}
