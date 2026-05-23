// agent/src/brands.ts - bot's view of the brand vocab.
//
// MUST STAY IN SYNC with src/lib/brands.ts (web). The two files duplicate
// BRANDS + BRAND_SLUGS so the bot's hashtag parser and the web's filter chip
// agree on canonical names. There's no shared package between web and agent.

export const BRANDS = [
  'The ZAO',
  'ZAO Devz',
  'ZAOstock',
  'ZAO Festivals',
  'ZAO-PALOOZA',
  'ZAO-CHELLA',
  'WaveWarZ',
  'ZABAL Games',
  'ZABAL',
  'BetterCallZaal',
  'BCZ Strategies',
  'ZAO Music',
  'ZOUNZ',
  'FISHBOWLZ',
  'POIDH',
  'ZOE',
  'Hermes',
  'Bonfire',
  'Juke',
  'COC Concertz',
] as const;

export type BrandName = (typeof BRANDS)[number];

export const BRAND_SLUGS: Record<string, BrandName> = {
  zao: 'The ZAO',
  'the-zao': 'The ZAO',
  thezao: 'The ZAO',
  zaodevz: 'ZAO Devz',
  'zao-devz': 'ZAO Devz',
  devz: 'ZAO Devz',
  zaostock: 'ZAOstock',
  'zao-stock': 'ZAOstock',
  'zao-festivals': 'ZAO Festivals',
  festivals: 'ZAO Festivals',
  'zao-palooza': 'ZAO-PALOOZA',
  zaopalooza: 'ZAO-PALOOZA',
  palooza: 'ZAO-PALOOZA',
  'zao-chella': 'ZAO-CHELLA',
  zaochella: 'ZAO-CHELLA',
  chella: 'ZAO-CHELLA',
  wavewarz: 'WaveWarZ',
  wavewars: 'WaveWarZ',
  ww: 'WaveWarZ',
  'zabal-games': 'ZABAL Games',
  zabalgames: 'ZABAL Games',
  games: 'ZABAL Games',
  zabal: 'ZABAL',
  bcz: 'BetterCallZaal',
  bettercallzaal: 'BetterCallZaal',
  'bcz-strategies': 'BCZ Strategies',
  strategies: 'BCZ Strategies',
  'zao-music': 'ZAO Music',
  zaomusic: 'ZAO Music',
  music: 'ZAO Music',
  zounz: 'ZOUNZ',
  fishbowlz: 'FISHBOWLZ',
  fb: 'FISHBOWLZ',
  poidh: 'POIDH',
  zoe: 'ZOE',
  hermes: 'Hermes',
  bonfire: 'Bonfire',
  juke: 'Juke',
  coc: 'COC Concertz',
  'coc-concertz': 'COC Concertz',
};

// Parse "#brand" / "#brand-slug" tokens from arbitrary text. Returns the
// matched canonical brands plus the input with recognized hashtags stripped.
// Unknown hashtags are left in place.
export function parseBrandHashtags(text: string): {
  brands: BrandName[];
  cleaned: string;
} {
  const found = new Set<BrandName>();
  const cleaned = text.replace(/#([a-z0-9-]+)/gi, (whole, raw: string) => {
    const brand = BRAND_SLUGS[raw.toLowerCase()];
    if (brand) {
      found.add(brand);
      return '';
    }
    return whole;
  });
  return {
    brands: Array.from(found),
    cleaned: cleaned.replace(/\s+/g, ' ').trim(),
  };
}

export function canonicalizeBrand(raw: string | undefined | null): BrandName | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const direct = BRANDS.find((b) => b.toLowerCase() === lower);
  if (direct) return direct;
  return BRAND_SLUGS[lower] ?? null;
}
