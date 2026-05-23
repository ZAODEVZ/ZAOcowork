// brands.ts - canonical list of ZAO ecosystem brands + hashtag/slug helpers.
//
// A task can carry zero, one, or many brands (`brands: string[]` on ActionItem,
// `brands text[]` in Supabase). The board filters by overlap.
//
// Adding a brand: append to BRANDS, add slug aliases to BRAND_SLUGS. No
// migration needed. Removing one: keep it in BRANDS until backfilled out so
// existing tasks still display.

export const BRANDS = [
  "The ZAO",
  "ZAO Devz",
  "ZAOstock",
  "ZAO Festivals",
  "ZAO-PALOOZA",
  "ZAO-CHELLA",
  "WaveWarZ",
  "ZABAL Games",
  "ZABAL",
  "BetterCallZaal",
  "BCZ Strategies",
  "ZAO Music",
  "ZOUNZ",
  "FISHBOWLZ",
  "POIDH",
  "ZOE",
  "Hermes",
  "Bonfire",
  "Juke",
  "COC Concertz",
] as const;

export type BrandName = (typeof BRANDS)[number];

// Hashtag/URL slug -> canonical brand. Multiple slugs can map to one brand
// (e.g. `#zao-stock` and `#zaostock` both resolve to "ZAOstock"). Lowercase
// alphanumerics + hyphens only.
export const BRAND_SLUGS: Record<string, BrandName> = {
  zao: "The ZAO",
  "the-zao": "The ZAO",
  thezao: "The ZAO",
  zaodevz: "ZAO Devz",
  "zao-devz": "ZAO Devz",
  devz: "ZAO Devz",
  zaostock: "ZAOstock",
  "zao-stock": "ZAOstock",
  "zao-festivals": "ZAO Festivals",
  festivals: "ZAO Festivals",
  "zao-palooza": "ZAO-PALOOZA",
  zaopalooza: "ZAO-PALOOZA",
  palooza: "ZAO-PALOOZA",
  "zao-chella": "ZAO-CHELLA",
  zaochella: "ZAO-CHELLA",
  chella: "ZAO-CHELLA",
  wavewarz: "WaveWarZ",
  wavewars: "WaveWarZ",
  ww: "WaveWarZ",
  "zabal-games": "ZABAL Games",
  zabalgames: "ZABAL Games",
  games: "ZABAL Games",
  zabal: "ZABAL",
  bcz: "BetterCallZaal",
  bettercallzaal: "BetterCallZaal",
  "bcz-strategies": "BCZ Strategies",
  strategies: "BCZ Strategies",
  "zao-music": "ZAO Music",
  zaomusic: "ZAO Music",
  music: "ZAO Music",
  zounz: "ZOUNZ",
  fishbowlz: "FISHBOWLZ",
  fb: "FISHBOWLZ",
  poidh: "POIDH",
  zoe: "ZOE",
  hermes: "Hermes",
  bonfire: "Bonfire",
  juke: "Juke",
  coc: "COC Concertz",
  "coc-concertz": "COC Concertz",
};

// Parse "#brand" / "#brand-slug" tokens from arbitrary text. Returns the
// matched canonical brands plus the input with recognized hashtags stripped
// (unrecognized hashtags are left in place). Used by the bot's /add command
// and the web add form so `/add #zaostock book the parklet` lands with
// `brands: ["ZAOstock"]` and title `"book the parklet"`.
export function parseBrandHashtags(text: string): {
  brands: BrandName[];
  cleaned: string;
} {
  const found = new Set<BrandName>();
  const cleaned = text.replace(/#([a-z0-9-]+)/gi, (whole, raw: string) => {
    const brand = BRAND_SLUGS[raw.toLowerCase()];
    if (brand) {
      found.add(brand);
      return ""; // drop the hashtag from the title
    }
    return whole; // unknown - leave it
  });
  return {
    brands: Array.from(found),
    cleaned: cleaned.replace(/\s+/g, " ").trim(),
  };
}

// Canonicalize an arbitrary brand string against the controlled list. Returns
// null if not recognized. Accepts both display names ("ZAOstock") and slugs
// ("zao-stock").
export function canonicalizeBrand(raw: string | undefined | null): BrandName | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const direct = BRANDS.find((b) => b.toLowerCase() === lower);
  if (direct) return direct;
  return BRAND_SLUGS[lower] ?? null;
}

// Display helper - color band per brand family, used by the badge in the
// task card. Cosmetic only; safe to extend.
const BRAND_COLOR: Record<string, string> = {
  "The ZAO": "bg-indigo-600/30 text-indigo-200 border-indigo-500/40",
  "ZAOstock": "bg-amber-600/30 text-amber-200 border-amber-500/40",
  "ZAO Festivals": "bg-amber-700/30 text-amber-200 border-amber-600/40",
  "ZAO-PALOOZA": "bg-amber-700/30 text-amber-200 border-amber-600/40",
  "ZAO-CHELLA": "bg-amber-700/30 text-amber-200 border-amber-600/40",
  "WaveWarZ": "bg-cyan-600/30 text-cyan-200 border-cyan-500/40",
  "ZABAL Games": "bg-fuchsia-600/30 text-fuchsia-200 border-fuchsia-500/40",
  "ZABAL": "bg-fuchsia-700/30 text-fuchsia-200 border-fuchsia-600/40",
  "BetterCallZaal": "bg-emerald-600/30 text-emerald-200 border-emerald-500/40",
  "BCZ Strategies": "bg-emerald-700/30 text-emerald-200 border-emerald-600/40",
  "ZAO Music": "bg-rose-600/30 text-rose-200 border-rose-500/40",
  "ZOUNZ": "bg-rose-700/30 text-rose-200 border-rose-600/40",
  "ZAO Devz": "bg-slate-600/30 text-slate-200 border-slate-500/40",
  "ZOE": "bg-violet-600/30 text-violet-200 border-violet-500/40",
  "Hermes": "bg-violet-700/30 text-violet-200 border-violet-600/40",
  "Bonfire": "bg-orange-600/30 text-orange-200 border-orange-500/40",
  "Juke": "bg-pink-600/30 text-pink-200 border-pink-500/40",
  "FISHBOWLZ": "bg-teal-600/30 text-teal-200 border-teal-500/40",
  "POIDH": "bg-yellow-600/30 text-yellow-200 border-yellow-500/40",
  "COC Concertz": "bg-red-600/30 text-red-200 border-red-500/40",
};

export function brandColor(brand: string): string {
  return BRAND_COLOR[brand] ?? "bg-white/10 text-white/70 border-white/20";
}
