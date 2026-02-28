import { Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "better-sqlite3";
import type { LLMClient } from "../services/llm.ts";

const SENTINEL_LEGAL_SYSTEM_PROMPT = `You are Sentinel-Legal, a regulatory compliance monitor for the Myanmar
diplomatic mission in India. You analyse economic intelligence items for
legal and regulatory changes that affect Myanmar–India bilateral trade.

Analyse this item and return only valid JSON:
{
  "is_regulatory_change": boolean,
  "alert_type": one of [TARIFF_CHANGE, FDI_RULE, CUSTOMS_PROCEDURE,
                         BILATERAL_AGREEMENT, TRADE_RESTRICTION,
                         INVESTMENT_LAW, TAX_POLICY, NOT_APPLICABLE],
  "affected_regulation": string or null (name of specific law, schedule, or rule),
  "summary": string (2-3 sentences — plain language explanation of the change
              and its specific implication for Myanmar exporters or investors in India),
  "affected_sectors": string[] (sectors from the active list that are impacted),
  "bit_conflict": boolean (true if this may conflict with the Myanmar-India
                  Bilateral Investment Treaty),
  "bit_conflict_note": string or null (specific clause or provision at risk if bit_conflict true),
  "severity": one of [critical, high, medium, low],
  "recommended_action": string or null (one-sentence action for the diplomat)
}

If is_regulatory_change is false, return alert_type: "NOT_APPLICABLE" and
null for all other fields. Return only valid JSON, no markdown.`;

export async function runSentinelLegal(db: Database, llmClient: LLMClient) {
    console.log("[Sentinel-Legal] Starting regulatory scan...");

    try {
        // Query items tagged REGULATORY or BILATERAL in the last 48 hours not yet reviewed
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const pendingItems = db.prepare(`
            SELECT id, headline, body, source 
            FROM intelligence_items 
            WHERE (tag = 'REGULATORY' OR tag = 'BILATERAL') 
            AND legal_reviewed = 0 
            AND ingested_at >= ?
        `).all(fortyEightHoursAgo) as any[];

        if (pendingItems.length === 0) {
            console.log("[Sentinel-Legal] No pending items to review.");
            return;
        }

        // Get active sectors from 'home' entities
        const sectorsResult = db.prepare("SELECT DISTINCT sector FROM entities WHERE type = 'home'").all() as any[];
        const activeSectors = sectorsResult.map(r => r.sector);
        const sectorsListStr = activeSectors.length > 0 ? activeSectors.join(", ") : "None currently active";

        for (const item of pendingItems) {
            console.log(`[Sentinel-Legal] Reviewing: ${item.headline}`);
            const prompt = `Intelligence item:
Headline: ${item.headline}
Body: ${item.body}
Source: ${item.source}

Active sectors with Myanmar trade interests in India:
${sectorsListStr}`;

            try {
                const resultText = await llmClient.generate(
                    SENTINEL_LEGAL_SYSTEM_PROMPT,
                    prompt,
                    "application/json",
                    {
                        type: Type.OBJECT,
                        properties: {
                            is_regulatory_change: { type: Type.BOOLEAN },
                            alert_type: { type: Type.STRING },
                            affected_regulation: { type: Type.STRING, nullable: true },
                            summary: { type: Type.STRING, nullable: true },
                            affected_sectors: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                nullable: true
                            },
                            bit_conflict: { type: Type.BOOLEAN, nullable: true },
                            bit_conflict_note: { type: Type.STRING, nullable: true },
                            severity: { type: Type.STRING, nullable: true },
                            recommended_action: { type: Type.STRING, nullable: true }
                        },
                        required: ["is_regulatory_change", "alert_type"]
                    }
                );

                const analysis = JSON.parse(resultText);

                if (analysis.is_regulatory_change && analysis.alert_type !== 'NOT_APPLICABLE') {
                    // Cross-reference logic (TypeScript, no LLM)
                    let affectedEntityIds: string[] = [];
                    if (analysis.affected_sectors && analysis.affected_sectors.length > 0) {
                        const placeholders = analysis.affected_sectors.map(() => '?').join(',');
                        const affectedEntities = db.prepare(`
                            SELECT id FROM entities 
                            WHERE sector IN (${placeholders}) AND type = 'home'
                        `).all(...analysis.affected_sectors) as any[];
                        affectedEntityIds = affectedEntities.map(e => e.id);
                    }

                    // Insert legal alert
                    db.prepare(`
                        INSERT INTO legal_alerts (
                            id, intelligence_item_id, alert_type, affected_regulation, summary, 
                            affected_entity_ids, affected_sectors, bit_conflict, bit_conflict_note, severity
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        uuidv4(),
                        item.id,
                        analysis.alert_type,
                        analysis.affected_regulation || "Unknown Regulation",
                        analysis.summary || "No summary provided.",
                        JSON.stringify(affectedEntityIds),
                        JSON.stringify(analysis.affected_sectors || []),
                        analysis.bit_conflict ? 1 : 0,
                        analysis.bit_conflict_note || null,
                        analysis.severity || 'low'
                    );

                    console.log(`[Sentinel-Legal] Alert generated for: ${item.headline}`);
                }

                // Mark item as reviewed
                db.prepare(`UPDATE intelligence_items SET legal_reviewed = 1 WHERE id = ?`).run(item.id);

            } catch (llmError) {
                console.error(`[Sentinel-Legal] Failed to classify item ${item.id}:`, llmError);
            }
        }

        console.log("[Sentinel-Legal] Regulatory scan complete.");

    } catch (error) {
        console.error("[Sentinel-Legal] Error during regulatory scan:", error);
    }
}
