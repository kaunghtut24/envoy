import { GoogleGenAI, Type } from "@google/genai";

export interface LLMClient {
    generate(systemPrompt: string, userPrompt: string, responseMimeType?: string, responseSchema?: any): Promise<string>;
}

export class GeminiClient implements LLMClient {
    private genAI: GoogleGenAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenAI({ apiKey });
    }

    async generate(systemPrompt: string, userPrompt: string, responseMimeType?: string, responseSchema?: any): Promise<string> {
        const config: any = {
            systemInstruction: systemPrompt,
        };

        if (responseMimeType) {
            config.responseMimeType = responseMimeType;
        }

        if (responseSchema) {
            config.responseSchema = responseSchema;
        }

        const result = await this.genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            config
        });

        return result.text;
    }
}

export class OllamaClient implements LLMClient {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl: string, model: string) {
        this.baseUrl = baseUrl;
        this.model = model;
    }

    async generate(systemPrompt: string, userPrompt: string, responseMimeType?: string, responseSchema?: any): Promise<string> {
        const res = await fetch(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.model,
                system: systemPrompt,
                prompt: userPrompt,
                stream: false,
                format: responseMimeType === "application/json" ? "json" : undefined,
            }),
        });
        const data = await res.json();
        return data.response;
    }
}

export function createLLMClient(): LLMClient {
    const provider = process.env.LLM_PROVIDER ?? "gemini";

    if (provider === "gemini") {
        return new GeminiClient(process.env.GEMINI_API_KEY!);
    }

    if (provider === "ollama") {
        return new OllamaClient(
            process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
            process.env.OLLAMA_MODEL ?? "mistral"
        );
    }

    throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
