import type { ActionItem, ActionStatus, Owner, Priority } from "./types";

export type ParsedAction =
  | {
      type: "create";
      title: string;
      owner: Owner | null;
      status: ActionStatus;
      priority: Priority;
      notes: string;
      claimable: boolean;
    }
  | {
      type: "update_status";
      itemId: string;
      matchedTitle: string;
      newStatus: ActionStatus;
    }
  | {
      type: "add_note";
      itemId: string;
      matchedTitle: string;
      note: string;
    };

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","can",
  "this","that","these","those","it","its","we","i","you","they","he","she",
  "all","some","any","not","so","if","then","just","also","as","up","out",
]);

function meaningful(word: string): boolean {
  return word.length > 2 && !STOP_WORDS.has(word.toLowerCase());
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(meaningful),
  );
}

function jaccardScore(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

function detectOwner(text: string): Owner | null {
  if (/\biman\b/i.test(text)) return "Iman";
  if (/\bzaal\b/i.test(text)) return "Zaal";
  if (/\bboth\b/i.test(text)) return "Both";
  return null;
}

function detectStatus(text: string): ActionStatus | null {
  const lc = text.toLowerCase();
  if (/\b(done|completed|finished|complete|closed|shipped|delivered|resolved)\b/.test(lc))
    return "DONE";
  if (/\b(blocked|stuck|waiting for|waiting on|on hold|delayed|stalled)\b/.test(lc))
    return "BLOCKED";
  if (/\b(in progress|wip|working on|started|ongoing|underway|active|now working)\b/.test(lc))
    return "WIP";
  return null;
}

function detectPriority(text: string): Priority {
  const lc = text.toLowerCase();
  if (/\b(p1|urgent|critical|asap|immediately|high priority|top priority|!!)\b/.test(lc))
    return "P1";
  if (/\b(p3|low|minor|someday|nice to have|low priority|backlog|eventually)\b/.test(lc))
    return "P3";
  return "P2";
}

const TASK_MARKERS = /^([-*•]\s+|\d+[.)]\s+|\[[ xX✓]\]\s+)/;

const ACTION_VERBS =
  /\b(add|build|create|design|develop|fix|implement|improve|integrate|launch|make|optimize|prepare|push|refactor|release|review|set up|setup|ship|test|update|upgrade|write|deploy|configure|install|check|verify|complete|finish|start|begin|schedule|organize|coordinate|plan|send|contact|follow up|investigate|debug|resolve|handle|process|manage|track|monitor|analyze|research|document|draft|edit|migrate|move|remove|delete|archive|sync|connect|merge|close|submit|approve|record|distribute|post|upload|confirm|book|call|meet)\b/i;

function isTaskLike(line: string): boolean {
  if (TASK_MARKERS.test(line)) return true;
  if (line.length < 8 || line.length > 250) return false;
  return ACTION_VERBS.test(line);
}

function cleanTitle(raw: string): string {
  return raw
    .replace(TASK_MARKERS, "")
    .replace(/\b(iman|zaal|both)\s*[-:–]?\s*/gi, "")
    .replace(/\b(p1|p2|p3)\b/gi, "")
    .replace(
      /\b(urgent|critical|asap|done|completed|finished|in progress|wip|blocked|stuck)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/^[.,;:!?-]+|[.,;:!?]+$/g, "")
    .trim();
}

function findBestMatch(
  line: string,
  items: ActionItem[],
): ActionItem | null {
  let best: ActionItem | null = null;
  let bestScore = 0.38; // threshold — require decent overlap

  for (const item of items) {
    // Exact substring match boosts score
    const lc = line.toLowerCase();
    const titleLc = item.title.toLowerCase();
    if (titleLc.length > 5 && lc.includes(titleLc)) {
      if (1 > bestScore) {
        bestScore = 1;
        best = item;
      }
      continue;
    }
    const score = jaccardScore(line, item.title);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

export function parseText(
  text: string,
  existingItems: ActionItem[],
): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const seen = new Set<string>(); // deduplicate by title

  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && !/^[#\-_=*]{3,}$/.test(l));

  for (const line of lines) {
    const detectedStatus = detectStatus(line);
    const owner = detectOwner(line);
    const priority = detectPriority(line);
    const taskLike = isTaskLike(line);

    const matched = findBestMatch(line, existingItems);

    if (matched) {
      if (detectedStatus && matched.status !== detectedStatus) {
        const key = `status:${matched.id}:${detectedStatus}`;
        if (!seen.has(key)) {
          seen.add(key);
          actions.push({
            type: "update_status",
            itemId: matched.id,
            matchedTitle: matched.title,
            newStatus: detectedStatus,
          });
        }
      } else {
        const key = `note:${matched.id}:${line.slice(0, 40)}`;
        if (!seen.has(key)) {
          seen.add(key);
          actions.push({
            type: "add_note",
            itemId: matched.id,
            matchedTitle: matched.title,
            note: line,
          });
        }
      }
    } else if (taskLike) {
      const title = cleanTitle(line);
      if (title.length >= 4) {
        const key = `create:${title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          actions.push({
            type: "create",
            title: title.length > 90 ? title.slice(0, 90) + "…" : title,
            owner,
            // Doc 764 F4: NL-created items default to TRIAGE so a lead
            // routes them with fresh context before they hit TODO. The
            // explicit-status path (user wrote "wip..." or "blocked...")
            // still honors that intent.
            status: detectedStatus || "TRIAGE",
            priority,
            notes: "",
            claimable: !owner,
          });
        }
      }
    }
  }

  return actions;
}
