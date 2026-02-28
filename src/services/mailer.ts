import { google } from "googleapis";

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const fromEmail = process.env.DIPLOMAT_EMAIL;

    if (!fromEmail || !clientId || !clientSecret || !refreshToken) {
        console.error("[Mailer] Missing email configuration in environment variables.");
        return false;
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const message = [
        `To: ${to}`,
        `From: ${fromEmail}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        body
    ].join("\r\n");

    const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    try {
        await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        });
        return true;
    } catch (error) {
        console.error("[Mailer] Failed to send email:", error);
        return false;
    }
}
