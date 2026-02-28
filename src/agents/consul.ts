import { GoogleGenAI, Type } from "@google/genai";

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

export async function runConsulRouting(instruction: string, genAI: GoogleGenAI) {
    try {
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: instruction }] }],
            config: {
                systemInstruction: CONSUL_SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        agent: { type: Type.STRING },
                        intent: { type: Type.STRING },
                        response: { type: Type.STRING }
                    },
                    required: ["agent", "intent", "response"]
                }
            }
        });

        return JSON.parse(result.text);
    } catch (error) {
        console.error("[Consul] Error during routing:", error);
        return {
            agent: "none",
            intent: instruction,
            response: "I encountered an error while trying to process your command. Please try again."
        };
    }
}
