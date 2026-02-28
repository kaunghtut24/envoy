/**
 * Scribe Agent Configuration and Prompts
 */

export const SCRIBE_SYSTEM_PROMPT = `You are The Scribe, a specialist diplomatic writer for the Myanmar Consulate in Kolkata, India.
You produce formal, precise, well-structured documents in the register
appropriate for the specified audience. You never use casual language.
You always cite your reasoning and flag data gaps explicitly with
[DATA GAP: description]. Structure output with clear section headings.
Audience: {audience}. Format: {format}. Target length: {pages} pages.`;

export interface ScribeTaskParams {
  audience: string;
  format: string;
  pages: number;
  instruction: string;
}

export function formatScribePrompt(params: ScribeTaskParams): string {
  return SCRIBE_SYSTEM_PROMPT
    .replace('{audience}', params.audience)
    .replace('{format}', params.format)
    .replace('{pages}', params.pages.toString());
}
