export function validateEnv() {
    const required = [
        "ENVOY_JWT_SECRET",
        "LLM_PROVIDER",
    ];
    const conditional: Record<string, string[]> = {
        gemini: ["GEMINI_API_KEY"],
        ollama: ["OLLAMA_BASE_URL", "OLLAMA_MODEL"],
    };
    const missing = required.filter(k => !process.env[k]);
    const provider = process.env.LLM_PROVIDER || "gemini";
    const missingConditional = (conditional[provider] ?? []).filter(k => !process.env[k]);

    if (missing.length || missingConditional.length) {
        console.error("ENVOY startup failed — missing required env vars:");
        [...missing, ...missingConditional].forEach(k => console.error(`  ✗ ${k}`));
        process.exit(1);
    }
    console.log(`ENVOY config valid — LLM provider: ${provider}`);
}
