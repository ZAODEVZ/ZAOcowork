// Public surface for the bonfire integration.
// Keep this small - commands.ts only needs bonfireHook + isBonfireEnabled.
// v0.3.1 dropped the eventToChangeset + Node/Edge/Changeset exports; the
// Bonfires API takes natural-language episodes, not structured nodes.

export { bonfireHook, isBonfireEnabled, bonfireStatusLine, drainSpool, eventToEpisode } from './bonfire';
export type { TeamEvent, TeamEventOp } from './types';
