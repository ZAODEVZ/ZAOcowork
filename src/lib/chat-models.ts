// Client-safe list of models the Assistant can use, served through OpenRouter
// (https://openrouter.ai). `id` is the OpenRouter model slug; the API route
// validates the selected id against this list before forwarding, so the client
// can't request an arbitrary (or expensive) model. Add/remove entries here —
// browse slugs at https://openrouter.ai/models.
export interface ChatModel {
  id: string;
  label: string;
}

export const CHAT_MODELS: ChatModel[] = [
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (fast, cheap)" },
  { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
];

// Cheap + fast default so casual board questions don't run up a bill.
export const DEFAULT_CHAT_MODEL = "anthropic/claude-3.5-haiku";

export function isValidChatModel(id: unknown): id is string {
  return typeof id === "string" && CHAT_MODELS.some((m) => m.id === id);
}
