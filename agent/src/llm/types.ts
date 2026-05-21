// LLM provider abstraction for v2.5.
// Four providers - default = claude-max (Hermes pattern, $0 marginal via Max OAuth).

export type Provider = 'claude-max' | 'claude-api' | 'openai' | 'minimax';

export const PROVIDERS: readonly Provider[] = ['claude-max', 'claude-api', 'openai', 'minimax'];

export interface LLMRequest {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  apiKey?: string;
}

export interface LLMError extends Error {
  provider: Provider;
  model: string;
  status?: number;
}

export function llmError(provider: Provider, model: string, msg: string, status?: number): LLMError {
  const err = new Error(`[${provider}/${model}] ${msg}`) as LLMError;
  err.provider = provider;
  err.model = model;
  err.status = status;
  return err;
}
