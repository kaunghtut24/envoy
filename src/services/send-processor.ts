import { v4 as uuidv4 } from "uuid";
import { sendEmail } from "./mailer.js"; // Note: might need to be .ts or omitted per configuration. Using .js equivalent or .ts since it's tsx/vite. Let's use .ts
// Wait, in Node ES modules sometimes it's .ts or omit it. The other agents are imported as .ts in server.ts
import { sendEmail as mailerSend } from "./mailer.ts";

export async function processSendQueue(db: any, gmail?: any) {
    console.log("[SendProcessor] Checking send_queue for pending emails...");

    const queue = db.prepare(`
    SELECT * FROM send_queue 
    WHERE status = 'queued' 
    ORDER BY approved_at ASC 
    LIMIT 10
  `).all();

    for (const item of queue) {
        console.log(`[SendProcessor] Attempting to send ${item.type} to ${item.to_email}`);
        const success = await mailerSend(item.to_email, item.subject, item.body);

        if (success) {
            db.prepare(`
        UPDATE send_queue 
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(item.id);

            db.prepare(`
        INSERT INTO audit_log (id, agent, action_type, payload, diplomat_id)
        VALUES (?, 'consul', 'email_sent', ?, ?)
      `).run(
                uuidv4(),
                JSON.stringify({ queue_id: item.id, to: item.to_email, subject: item.subject }),
                item.diplomat_id
            );
        } else {
            db.prepare(`
        UPDATE send_queue 
        SET status = 'failed', error = ? 
        WHERE id = ?
      `).run("Failed to send email via Gmail API", item.id);

            db.prepare(`
        INSERT INTO audit_log (id, agent, action_type, payload, diplomat_id)
        VALUES (?, 'consul', 'email_failed', ?, ?)
      `).run(
                uuidv4(),
                JSON.stringify({ queue_id: item.id, error: "Failed to send email via Gmail API" }),
                item.diplomat_id
            );
        }
    }
}
