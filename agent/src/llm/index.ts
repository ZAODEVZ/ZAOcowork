// Provider dispatcher.

import { callClaudeApi } from './claude-api';
import { callClaudeMax } from './claude-max';
import { callMinimax } from './minimax';
import { callOpenAI } from './openai';
import { type LLMRequest, type Provider } from './types';

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

export const DEFAULT_PROVIDER: Provider = (process.env.DEFAULT_LLM_PROVIDER as Provider) ?? 'claude-max';
export const DEFAULT_MODEL: string = process.env.DEFAULT_LLM_MODEL ?? 'haiku';

export { PROVIDERS } from './types';
export type { Provider, LLMRequest } from './types';
