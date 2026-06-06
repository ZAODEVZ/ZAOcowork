// Provider dispatcher.

import { callClaudeApi } from './claude-api';
import { callClaudeMax } from './claude-max';
import { callMinimax } from './minimax';
import { callOpenAI } from './openai';
import { type LLMRequest, type Provider, PROVIDERS } from './types';

export async function callLLM(req: LLMRequest): Promise<string> {
  switch (req.provider) {
    case 'claude-max': return callClaudeMax(req);
    case 'claude-api': return callClaudeApi(req);
    case 'openai': return callOpenAI(req);
    case 'minimax': return callMinimax(req);
    default:
      throw new Error(`unknown LLM provider: ${String(req.provider)}`);
  }
}

// Validate DEFAULT_LLM_PROVIDER at load time. An unchecked cast meant a typo
// (e.g. "gemini") silently became the default and every default-provider user
// hit "unknown LLM provider" on their first message (audit A9).
function resolveDefaultProvider(): Provider {
  const raw = process.env.DEFAULT_LLM_PROVIDER;
  if (!raw) return 'claude-max';
  if ((PROVIDERS as readonly string[]).includes(raw)) return raw as Provider;
  console.error(
    `[llm] DEFAULT_LLM_PROVIDER="${raw}" is not a valid provider ` +
      `(${PROVIDERS.join(', ')}). Falling back to claude-max.`,
  );
  return 'claude-max';
}

export const DEFAULT_PROVIDER: Provider = resolveDefaultProvider();
export const DEFAULT_MODEL: string = process.env.DEFAULT_LLM_MODEL ?? 'haiku';

export { PROVIDERS };
export type { Provider, LLMRequest } from './types';
