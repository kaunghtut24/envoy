import Parser from "rss-parser";
import { Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "better-sqlite3";
import type { LLMClient } from "../services/llm.ts";

const SENTINEL_SYSTEM_PROMPT = `You are The Sentinel, an economic intelligence monitoring agent for the Myanmar Consulate in Kolkata, India.
Your job is to scan raw news articles and RSS feeds to identity information that could impact Myanmar's trade or political objectives in India.
Return a JSON object with exactly these fields:
{
  "tag": one of [MONETARY_POLICY, INVESTMENT_OPPORTUNITY, REGULATORY, TRADE_DATA, CORPORATE, GEOPOLITICAL],
  "headline": string (max 120 chars, rewritten for diplomatic context),
  "body": string (3-5 sentences with diplomatic relevance explained),
  "priority": one of [high, medium, low],
  "flag": boolean (true only if immediate diplomat attention warranted),
  "action": string or null (short suggested action label if flag is true)
}
Return only valid JSON. No markdown, no explanation.`;

const parser = new Parser();

export async function runSentinel(db: Database, llmClient: LLMClient) {
  console.log("[Sentinel] Starting intelligence gathering...");

  try {
    const feeds = [
      // Economic Times India - Economy
      "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms",
      // Livemint - Companies
      "https://www.livemint.com/rss/companies",
      // The Hindu - Business
      "https://www.thehindu.com/business/feeder/default.rss"
    ];

    let newItemsIngested = 0;

    for (const feedUrl of feeds) {
      console.log(`[Sentinel] Fetching feed: ${feedUrl}`);
      try {
        const feed = await parser.parseURL(feedUrl);

        // Only process the 5 most recent items per feed to avoid API limits on first run
        const recentItems = feed.items.slice(0, 5);

        for (const item of recentItems) {
          const guid = item.guid || item.link;
          if (!guid) continue;

          // Deduplication check
          const existing = db.prepare("SELECT id FROM intelligence_items WHERE source = ?").get(guid);
          if (existing) continue;

          console.log(`[Sentinel] Processing new item: ${item.title}`);

          const prompt = `Headline: ${item.title}\nDescription: ${item.contentSnippet || item.content}`;

          try {
            const resultText = await llmClient.generate(
              SENTINEL_SYSTEM_PROMPT,
              prompt,
              "application/json",
              {
                type: Type.OBJECT,
                properties: {
                  tag: { type: Type.STRING },
                  headline: { type: Type.STRING },
                  body: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  flag: { type: Type.BOOLEAN },
                  action: { type: Type.STRING, nullable: true }
                },
                required: ["tag", "headline", "body", "priority", "flag"]
              }
            );

            const intelligence = JSON.parse(resultText);

            db.prepare(`
              INSERT INTO intelligence_items (id, tag, source, headline, body, priority, flag, action, published_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              uuidv4(),
              intelligence.tag,
              guid,
              intelligence.headline,
              intelligence.body,
              intelligence.priority,
              intelligence.flag ? 1 : 0,
              intelligence.action || null,
              item.isoDate || new Date().toISOString()
            );

            console.log(`[Sentinel] Ingested: ${intelligence.headline}`);
            newItemsIngested++;
          } catch (err) {
            console.error(`[Sentinel] Failed to process item ${item.title}:`, err);
          }
        }
      } catch (feedErr) {
        console.error(`[Sentinel] Error fetching feed ${feedUrl}:`, feedErr);
      }
    }

    console.log(`[Sentinel] Intelligence gathering complete. Ingested ${newItemsIngested} new items.`);
  } catch (error) {
    console.error("[Sentinel] Error fetching RSS feed:", error);
  }
}
