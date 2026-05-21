// OpenAI chat completions. Per-user key OR env OPENAI_API_KEY.

import { llmError, type LLMRequest } from './types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { type: string; message: string };
}

export async function callOpenAI(req: LLMRequest): Promise<string> {
  const key = req.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) throw llmError('openai', req.model, 'no api key (per-user or OPENAI_API_KEY env)');
  const res = await fetch(OPENAI_URL, {
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
    throw llmError('openai', req.model, `${res.status} ${body.slice(0, 200)}`, res.status);
  }
  const data = (await res.json()) as OpenAIResponse;
  if (data.error) throw llmError('openai', req.model, `${data.error.type}: ${data.error.message}`);
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw llmError('openai', req.model, 'empty response');
  return text.trim();
}
