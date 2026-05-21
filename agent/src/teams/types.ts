// Bonfires integration types (Phase 1 per Doc 669).
// Each action-tracker mutation emits a TeamEvent which the bonfire hook
// converts to a Bonfires episode (natural-language ingest; their auto-
// extraction builds the KG). v0.3.1 dropped the kEngram changeset model
// since the real API at /knowledge_graph/episode/create takes text bodies.

import type { ActionItem, Owner, Priority, Phase } from '../types';

export type TeamEventOp =
  | 'add'
  | 'wip'
  | 'blocked'
  | 'done'
  | 'assign'
  | 'setdue'
  | 'setnote'
  | 'setprio';

export interface TeamEvent {
  op: TeamEventOp;
  item: ActionItem;
  actor: string; // human-readable username of the person triggering
  actorTgId: number; // telegram id for graph identity
  brand?: string; // optional brand tag, defaults to "ZAO" if not provided
  // op-specific extras
  reason?: string; // for blocked / done
  previousOwner?: Owner; // for assign
  previousDue?: string; // for setdue
  previousPriority?: Priority; // for setprio
  previousPhase?: Phase; // reserved for future setphase
  timestamp: string; // ISO UTC
}

// Legacy: BonfireNode/Edge/Changeset removed in v0.3.1. The Bonfires API
// takes natural-language episodes (Doc 669 + verified endpoint), not
// structured node+edge changesets. Their auto-extraction infers entities
// and relationships from text. See bonfire.ts eventToEpisode().
