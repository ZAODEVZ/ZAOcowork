// ZAOcoworkingBot v2 - shared types.
// ActionItem + ActionsFile are VERBATIM from live data/actions.json.
// CoworkMessage is the transcript log shape.

// Tyler joined the roster 2026-05-23 (web PR #13); the bot still keeps
// the old 6-owner set as canonical for the Telegram command surface so
// the existing /list and /owner pickers don't break. Web side has Tyler.
export type Owner = 'Zaal' | 'Iman' | 'Both' | 'ThyRev' | 'Samantha' | 'Open';
// Doc 764 F4: TRIAGE is the inbox for external writers (this bot, /meeting
// capture, NL parser). Leads route TRIAGE -> TODO via /admin/triage before
// work begins. Added 2026-05-27.
export type ActionStatus = 'TRIAGE' | 'TODO' | 'WIP' | 'BLOCKED' | 'DONE';
export type Priority = 'P1' | 'P2' | 'P3';
export type Phase = 'Define' | 'Measure' | 'Analyze' | 'Improve' | 'Control';

export const OWNERS: readonly Owner[] = ['Zaal', 'Iman', 'Both', 'ThyRev', 'Samantha', 'Open'];
export const STATUSES: readonly ActionStatus[] = ['TRIAGE', 'TODO', 'WIP', 'BLOCKED', 'DONE'];
export const PRIORITIES: readonly Priority[] = ['P1', 'P2', 'P3'];

export interface ActionItem {
  // Supabase row UUID - the real primary key. Used to scope writes so a
  // task can be updated/deleted regardless of its legacy_source.
  dbId?: string;
  id: string;
  title: string;
  createdBy: string;
  owner: Owner;
  status: ActionStatus;
  category: string;
  priority: Priority;
  important: boolean;
  urgent: boolean;
  completedAt: string;
  completedBy: string;
  phase: Phase;
  due: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Ecosystem brand tags - empty array = no brand assigned. Canonical names
  // defined in agent/src/brands.ts (kept in sync with src/lib/brands.ts).
  brands: string[];
  // Doc 765 decision 2: source taxonomy. Bot writes default 'human-bot'.
  // Optional in the bot type since older rows pre-migration won't carry it.
  source?: string;
  // Doc 765 Phase I: project layer. Nullable. Bot doesn't set it today
  // (future: parse #project-slug like brand hashtags).
  projectId?: string | null;
}

export interface ActionsFile {
  updatedAt: string;
  items: ActionItem[];
}

export interface CoworkMessage {
  id: string;
  chat_id: string;
  chat_type: 'dm' | 'group';
  chat_title?: string;
  from_user_id: number;
  from_user_name: string;
  direction: 'in' | 'out';
  message_text: string;
  reply_to_id?: number;
  timestamp: string;
  bot_model?: string;
  response_latency_ms?: number;
}

export interface MemoryBlocks {
  persona: string;
  human: string;
  working: string;
  tasks: string;
  actions: string;
}

export interface SuggestActionOp {
  op: 'add' | 'wip' | 'blocked' | 'done' | 'assign' | 'setdue' | 'setnote' | 'setprio';
  id?: string;
  title?: string;
  owner?: Owner;
  reason?: string;
  category?: string;
  due?: string;
  notes?: string;
  appendNotes?: string;
  priority?: Priority;
}
