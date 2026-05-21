// MiniMax chat completions. OpenAI-compatible schema per their docs.
// API endpoint configurable via MINIMAX_API_URL (intl users hit different region).

import { llmError, type LLMRequest } from './types';

const DEFAULT_URL = process.env.MINIMAX_API_URL ?? 'https://api.minimaxi.chat/v1/text/chatcompletion_v2';

interface MinimaxResponse {
  choices?: Array<{ message?: { content?: string } }>;
  base_resp?: { status_code: number; status_msg: string };
}

export async function callMinimax(req: LLMRequest): Promise<string> {
  const key = req.apiKey ?? process.env.MINIMAX_API_KEY;
  if (!key) throw llmError('minimax', req.model, 'no api key (per-user or MINIMAX_API_KEY env)');
  const res = await fetch(DEFAULT_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw llmError('minimax', req.model, `${res.status} ${body.slice(0, 200)}`, res.status);
  }
  const data = (await res.json()) as MinimaxResponse;
  if (data.base_resp && data.base_resp.status_code !== 0) {
    throw llmError('minimax', req.model, `${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
  }
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw llmError('minimax', req.model, 'empty response');
  return text.trim();
}
