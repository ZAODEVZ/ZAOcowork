import { NextResponse, type NextRequest } from "next/server";
import { computeForecast } from "@/lib/forecast";
import { requireSession } from "@/lib/auth";

// /api/forecast?brand=X - Monte Carlo throughput forecast (doc 764 F1).
//
// Session-authed. Returns the full ForecastResult object so the dashboard
// widget can render percentile dates + the distribution chart.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await requireSession();
  const url = new URL(req.url);
  const brandParam = url.searchParams.get("brand");
  const brand = brandParam && brandParam.trim() ? brandParam.trim() : null;
  const result = await computeForecast(brand);
  return NextResponse.json({ ok: true, ...result });
}
