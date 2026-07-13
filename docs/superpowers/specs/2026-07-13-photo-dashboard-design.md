# Photo Dashboard Design

**Goal:** A place for Zaal to organize photos, queue them for posting to Fotocaster (a Farcaster photo app with paid collecting - collect mechanics confirmed directly by Zaal, not independently verifiable from Fotocaster's public code), track which ones get collected, and log the resulting collector-question-on-livestream perk. First sub-project of a 3-part photo-sharing initiative (dashboard -> gallery/papers embedding -> backlog triage), each with its own design/plan cycle.

**Architecture:** A new `/photos` page in the existing ZAOcowork Next.js app (`ZAODEVZ/ZAOcowork`), reusing its existing session auth and Supabase project (the "cowork" project, not the Zuke project used for RAG). One new table (`photos`) plus a new Supabase Storage bucket for the images themselves. No integration with Fotocaster's internals - posting stays a manual action Zaal does himself in the Fotocaster app; the dashboard's job is organizing, queuing, and status tracking around that manual step.

**Tech Stack:** Next.js (existing app router conventions), Supabase Postgres + Storage, existing `src/lib/auth.ts` session/permission model.

## Global Constraints

- Photos table lives in the **cowork** Supabase project (same one as `tasks`/`team_members`), not the Zuke project - this is board/ops data, not paper content.
- Only Zaal (or whoever has the existing "isLead" tier - Zaal, Iman, Shawn per `src/lib/auth.ts`) can create/edit photo entries and change status. Any logged-in team member can view the grid.
- Default price is exactly `5.00` (USD), editable per photo.
- Status values: `draft`, `ready`, `posted` - no other values, matching the existing text-CHECK-constraint convention used on `tasks.status` and similar columns.
- Question/collector fields are plain text fields Zaal fills in by hand after spotting activity on Farcaster - no automated detection, no Fotocaster API calls, no webhook.
- No new npm dependencies beyond what image upload to Supabase Storage needs (the existing `@supabase/supabase-js` client already supports Storage - no new package required).
- Follow the existing auth tiering: gate writes behind `requireSession` + `isLead()` (the "Ask" tier per `src/lib/auth.ts`'s documented model), matching how `/admin/proposals` and similar admin-ish actions are already gated. Reads only need `requireSession`.

---

## Data model

`public.photos` (new table, cowork Supabase project):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, default `gen_random_uuid()` | primary key |
| `storage_path` | text, not null | path within the `photos` Storage bucket |
| `caption` | text, not null | shown in the dashboard and (later) the gallery |
| `credit` | text, nullable | who's in the photo / who took it |
| `event` | text, nullable | e.g. "COC Concertz 2026", "ZAOstock" - free text, not a foreign key (no events table exists yet) |
| `photo_date` | date, nullable | when the photo was taken |
| `price_usd` | numeric(10,2), not null, default `5.00` | |
| `status` | text, not null, default `'draft'`, check `status in ('draft','ready','posted')` | |
| `fotocaster_url` | text, nullable | filled in once `status = 'posted'` |
| `collected` | boolean, not null, default `false` | |
| `collector_handle` | text, nullable | Farcaster handle of whoever collected it, once known |
| `question` | text, nullable | the collector's question, once they've tagged Zaal with it |
| `question_status` | text, not null, default `'none'`, check `question_status in ('none','received','scheduled','answered')` | |
| `livestream_time` | timestamptz, nullable | once scheduled |
| `livestream_url` | text, nullable | once known/happened |
| `created_by` | uuid, references `team_members(id)`, nullable | |
| `created_at` | timestamptz, default `now()` | |
| `updated_at` | timestamptz, default `now()` | |

A new Storage bucket `photos` (private, not public - served through the app's own routes so we control access the same way other data is gated, rather than a public bucket URL) holds the actual image files.

## Dashboard page

`/photos` (new route, same NavBar tier as other team pages):

- **Grid view**: thumbnail, caption, event tag, status badge (draft/ready/posted), price. Sorted newest first, filterable by status.
- **Upload form** (isLead only): drop/select an image, fill in caption (required), credit, event, date, price (defaults to 5.00). Saves as `draft`.
- **Status controls** (isLead only): a photo card has a "Mark ready" button (draft -> ready) and, once Zaal has actually posted it in Fotocaster, a "Mark posted" action that also prompts for the resulting Fotocaster URL.
- **Collector log** (isLead only, appears once a photo is `posted`): two small fields - "Collector handle" and a toggle marking `collected = true`; once collected, a "Question" text field and a `question_status` dropdown (none/received/scheduled/answered), plus optional livestream time/URL fields once scheduled.

No auto-refresh/realtime needed for v1 - a normal page load reflecting current DB state is enough, matching how the rest of the board works (no evidence of realtime subscriptions in the existing codebase).

## Testing

- Unit tests for any new pure helper functions (e.g. a `nextStatus`/status-transition validator, if one is introduced) following the existing `src/lib/types.test.ts`-style convention.
- No end-to-end/browser test required for v1 given the small, single-admin surface - manual verification (Zaal uploads a real photo, confirms it appears, changes status) is the acceptance test, per Zaal's own "let's get it up and test when ready, I have a photo in mind."

## Out of scope for this sub-project (tracked separately)

- The public gallery page and embedding photos into existing papers (sub-project 2 of the photo initiative).
- Backlog triage - bulk-importing Zaal's existing hundreds of photos (sub-project 3).
- Any Fotocaster API integration (none exists / needed - posting is manual by design).
- Public/community photo submission (explicitly deferred - "just Zaal for now" plus a Farcaster-tag request flow, which belongs to the gallery sub-project's "suggest a photo" button, not this dashboard).
