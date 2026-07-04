import { NextResponse, type NextRequest } from "next/server";
import { computeForecast } from "@/lib/forecast";
import { requireSession } from "@/lib/auth";

// /api/forecast?brand=X - Monte Carlo throughput forecast (doc 764 F1).
//
// Session-authed. Returns the full ForecastResult object so the dashboard
// widget can render percentile dates + the distribution chart.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const brandParam = url.searchParams.get("brand");
  const brand = brandParam && brandParam.trim() ? brandParam.trim() : null;
  try {
    const result = await computeForecast(brand);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Forecast computation failed:", err);
    return NextResponse.json({ ok: false, error: "Forecast computation failed" }, { status: 500 });
  }
}
