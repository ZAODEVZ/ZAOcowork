// Anthropic API direct call. Use when user explicitly chooses claude-api or
// brings their own ANTHROPIC_API_KEY. Costs hit the key owner.

import { llmError, type LLMRequest } from './types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export async function callClaudeApi(req: LLMRequest): Promise<string> {
  const key = req.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw llmError('claude-api', req.model, 'no api key (per-user or ANTHROPIC_API_KEY env)');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: normalizeModel(req.model),
      max_tokens: DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw llmError('claude-api', req.model, `${res.status} ${body.slice(0, 200)}`, res.status);
  }
  const data = (await res.json()) as AnthropicResponse;
  if (data.error) throw llmError('claude-api', req.model, `${data.error.type}: ${data.error.message}`);
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!text) throw llmError('claude-api', req.model, 'empty response');
  return text.trim();
}

function normalizeModel(short: string): string {
  // accept short aliases that match Max CLI flags
  const map: Record<string, string> = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
  };
  return map[short] ?? short;
}
