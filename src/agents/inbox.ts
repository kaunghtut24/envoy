import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";

/**
 * Parses the body from a Gmail message payload.
 * Prefers plain text over HTML.
 */
function getMessageBody(payload: any): string {
    let body = "";

    if (payload.parts) {
        const textPart = payload.parts.find((part: any) => part.mimeType === "text/plain");
        const htmlPart = payload.parts.find((part: any) => part.mimeType === "text/html");

        if (textPart && textPart.body && textPart.body.data) {
            body = Buffer.from(textPart.body.data, "base64").toString("utf8");
        } else if (htmlPart && htmlPart.body && htmlPart.body.data) {
            body = Buffer.from(htmlPart.body.data, "base64").toString("utf8");
            // Strip HTML tags simply
            body = body.replace(/<[^>]*>?/gm, "");
        } else {
            // Recurse down parts
            for (const part of payload.parts) {
                body += getMessageBody(part);
            }
        }
    } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, "base64").toString("utf8");
        if (payload.mimeType === "text/html") {
            body = body.replace(/<[^>]*>?/gm, "");
        }
    }

    return body.trim();
}

/**
 * Extracts a header value directly from the Gmail headers array.
 */
function getHeader(headers: any[], name: string): string {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : "";
}

/**
 * Helper to split "Sender Name <sender@example.com>" into name and org/email.
 */
function parseSender(fromHeader: string): { name: string, org: string } {
    const match = fromHeader.match(/^(.*?)\s*<(.*?)>$/);
    if (match) {
        // Basic extraction - could be refined to pull domain as org.
        // For now, let's use the email address or domain as the "org" if name is present.
        const name = match[1].replace(/"/g, "").trim();
        const email = match[2].trim();
        const domain = email.split("@")[1] || email;
        return { name: name || email, org: domain };
    }
    return { name: fromHeader, org: "Unknown" };
}

export async function runInboxSync(
    db: any,
    genAI: any,
    runScribeJob: (taskId: string, instruction: string, payload: any) => Promise<void>
) {
    console.log("[Inbox] Starting Gmail sync...");

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        console.log("[Inbox] Gmail API credentials missing. Skipping inbox sync.");
        return;
    }

    try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        // 1. Fetch unread emails from the last 24 hours
        const listRes = await gmail.users.messages.list({
            userId: "me",
            q: "is:unread newer_than:1d"
        });

        const messages = listRes.data.messages || [];
        console.log(`[Inbox] Found ${messages.length} unread messages in the last 24 hours.`);

        for (const msg of messages) {
            if (!msg.id) continue;

            // 2. Deduplicate against inbox_items 
            // check if we already have an item where json_extract(payload, '$.gmail_id') == msg.id
            // For sqlite, if payload is text, we can do a LIKE or use json_extract
            const existing = db.prepare(`
        SELECT id FROM inbox_items 
        WHERE json_extract(payload, '$.gmail_id') = ? OR
              payload LIKE ?
      `).get(msg.id, `%"gmail_id":"${msg.id}"%`);

            if (existing) {
                console.log(`[Inbox] Message ${msg.id} already exists, skipping.`);
                continue;
            }

            // Fetch full content
            const msgRes = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
                format: "full"
            });

            const messageData = msgRes.data;
            const headers = messageData.payload?.headers || [];

            const subject = getHeader(headers, "Subject") || "No Subject";
            const fromHeader = getHeader(headers, "From") || "Unknown Sender";
            const { name: fromName, org: fromOrg } = parseSender(fromHeader);

            const bodyFull = getMessageBody(messageData.payload);
            const bodyPreview = bodyFull.substring(0, 500);

            // 3. Gemini classification
            const prompt = `You are The Consul's inbox triage agent for the Myanmar diplomatic mission in India.
Classify this incoming email and determine if The Scribe should draft a reply.

Email from: ${fromName} (${fromOrg})
Subject: ${subject}
Body: ${bodyPreview}

Return only valid JSON (no markdown wrapping, strictly parsable):
{
  "urgency": "high" | "medium" | "low",
  "category": "ministerial" | "inquiry" | "logistics" | "internal" | "event",
  "requires_draft": boolean,
  "draft_instruction": "string" or null,
  "flag_reason": "string" or null
}

Set requires_draft: true for ministerial correspondence, business inquiries,
and anything referencing Myanmar-India trade, ASEAN, or bilateral matters.
Set draft_instruction to a one-sentence instruction for The Scribe if requires_draft is true.`;

            const result = await genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            });

            let classification;
            try {
                const textResponse = result.text.replace(/^```json/g, "").replace(/```$/g, "").trim();
                classification = JSON.parse(textResponse);
            } catch (parseErr) {
                console.error(`[Inbox] Failed to parse Gemini response for msg ${msg.id}. Defaulting to low priority.`);
                classification = {
                    urgency: "low",
                    category: "internal",
                    requires_draft: false,
                    draft_instruction: null,
                    flag_reason: null
                };
            }

            // 4. Auto-commission Scribe drafts if necessary
            const inboxId = uuidv4();

            db.prepare(`
        INSERT INTO inbox_items (id, from_name, from_org, subject, urgency, category, body, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
                inboxId,
                fromName,
                fromOrg,
                subject,
                classification.urgency || 'medium',
                classification.category || 'inquiry',
                bodyFull,
                JSON.stringify({
                    gmail_id: msg.id,
                    flag_reason: classification.flag_reason
                })
            );

            console.log(`[Inbox] Ingested msg ${msg.id} (Urgency: ${classification.urgency}, Category: ${classification.category})`);

            if (classification.requires_draft && classification.draft_instruction) {
                console.log(`[Inbox] Triggering Scribe job for msg ${msg.id}. Instruction: ${classification.draft_instruction}`);

                // We create a task explicitly for the Scribe to link to this inbox id
                const taskId = uuidv4();

                db.prepare(`
          INSERT INTO tasks (id, agent, type, title, status, progress, payload)
          VALUES (?, 'scribe', 'email_reply', ?, 'in_progress', 0, ?)
        `).run(
                    taskId,
                    `Draft Reply: ${subject}`,
                    JSON.stringify({
                        audience: `${fromName} (${fromOrg})`,
                        format: "email_reply",
                        inbox_item_id: inboxId // Scribe will need to know which inbox item to update
                    })
                );

                // We wrap the runScribeJob function to update the inbox item when done
                // Standard runScribeJob only updates `tasks.payload`.
                // We will execute runScribeJob, and then update inbox_items with the newly generated draft text.
                runScribeJob(taskId, classification.draft_instruction, {
                    audience: `${fromName} (${fromOrg})`,
                    format: "email_reply",
                    inbox_item_id: inboxId
                }).then(() => {
                    // After runScribeJob completes, fetch the draft from the tasks table
                    const completedTask = db.prepare("SELECT payload FROM tasks WHERE id = ?").get(taskId);
                    if (completedTask && completedTask.payload) {
                        const payloadObj = JSON.parse(completedTask.payload);
                        if (payloadObj.draft) {
                            db.prepare("UPDATE inbox_items SET draft_body = ? WHERE id = ?").run(payloadObj.draft, inboxId);
                            console.log(`[Inbox] Successfully attached draft reply to inbox item ${inboxId}`);
                        }
                    }
                }).catch(err => {
                    console.error(`[Inbox] Auto-commission draft failed for inbox item ${inboxId}`, err);
                });
            }
        }

        console.log("[Inbox] Gmail sync completed.");
    } catch (error) {
        console.error("[Inbox] Error during Gmail sync:", error);
    }
}
