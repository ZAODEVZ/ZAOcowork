import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { searchItems } from "@/lib/data";

// Auth-gated task search for the command palette. Server-side filtering so we
// never dump the whole board; returns up to 30 ranked matches.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return Response.json({ results: [] });

  // Matching happens in Postgres; the loop below only ranks what came back.
  const matches = await searchItems(q);
  type Hit = {
    id: string;
    title: string;
    status: string;
    owner: string;
    category: string;
    rank: number;
  };
  const hits: Hit[] = [];

  for (const it of matches) {
    const id = String(it.id).toLowerCase();
    const title = it.title.toLowerCase();
    const owner = String(it.owner).toLowerCase();
    const category = String(it.category).toLowerCase();
    const notes = (it.notes ?? "").toLowerCase();

    let rank = -1;
    if (id === q) rank = 0;
    else if (title.startsWith(q)) rank = 1;
    else if (title.includes(q)) rank = 2;
    else if (id.includes(q)) rank = 3;
    else if (owner.includes(q) || category.includes(q)) rank = 4;
    else if (notes.includes(q)) rank = 5;

    if (rank >= 0) {
      hits.push({
        id: it.id,
        title: it.title,
        status: it.status,
        owner: String(it.owner),
        category: String(it.category),
        rank,
      });
    }
  }

  hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return Response.json({ results: hits.slice(0, 30) });
}
