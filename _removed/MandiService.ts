/**
 * MandiService.ts — FarmNest Live Mandi Price Service
 *
 * DATA SOURCE: WFP / FAO — Pakistan Food Prices
 * API:         HDX CKAN DataStore (data.humdata.org) — publicly accessible, no auth
 * Resource ID: bd8a9735-b4e0-4e29-9c58-a7fa57b0c6fe  (Pakistan food prices)
 * Coverage:    Real Pakistan markets — Lahore, Karachi, Peshawar, Quetta, etc.
 * Frequency:   Monthly updates (source: PBS / FAO GIEWS / WFP field teams)
 * License:     CC BY-IGO — WFP / FAO
 *
 * How it works:
 *  1. Calls the HDX CKAN DataStore API — a proper public REST JSON API.
 *  2. Filters records to Pakistan, gets the most recent price per market+commodity.
 *  3. Prices are in PKR per unit as reported by WFP field staff.
 *  4. Cached for 24 hours in AsyncStorage.
 *  5. On network failure → throws so the UI shows an honest error (no fake data).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface MandiPrice {
  id: string;
  mandiName: string;
  city: string;
  province: string;
  cropName: string;
  cropNameUr: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  unit: string;
  lastUpdated: string;
  latitude: number;
  longitude: number;
}

export interface PriceHistory {
  date: string;
  avgPrice: number;
}

export interface MandiResult extends MandiPrice {
  distanceKm: number;
  transportCost: number;
  netProfit: number;
  trendPercent: number;
  trendDirection: 'rising' | 'falling' | 'stable';
}

export interface MandiRecommendation {
  bestPriceMandi: MandiResult | null;
  nearestMandi: MandiResult | null;
  bestProfitMandi: MandiResult | null;
  trendAdvice: 'sell_now' | 'wait' | 'monitor';
  trendAdviceReason: string;
  trendAdviceReasonUr: string;
  priceHistory: PriceHistory[];
}

export interface CropEntry {
  key: string;
  label: string;
  labelUr: string;
  emoji: string;
  category: 'grain' | 'vegetable' | 'fruit' | 'cash_crop' | 'spice' | 'pulse' | 'oilseed';
}

// ─────────────────────────────────────────────────────
// HDX CKAN DataStore row shape (Pakistan food prices)
// Columns: date, admin1, admin2, market, latitude, longitude,
//          category, commodity, unit, pricetype, currency, price, usdprice
// ─────────────────────────────────────────────────────

interface HdxRow {
  _id: number;
  date: string;       // e.g. "2025-03-15T00:00:00"
  admin1: string;     // province e.g. "Punjab"
  admin2: string;     // city
  market: string;     // market name e.g. "Lahore"
  latitude: string;
  longitude: string;
  category: string;
  commodity: string;  // e.g. "Wheat"
  unit: string;       // e.g. "KG"
  pricetype: string;  // "Retail" or "Wholesale"
  currency: string;   // "PKR"
  price: string;      // price as string
  usdprice: string;
}

interface HdxApiResponse {
  success: boolean;
  result: {
    total: number;
    records: HdxRow[];
  };
}

// ─────────────────────────────────────────────────────
// API constants
// HDX CKAN DataStore — Pakistan food prices resource
// resource_id confirmed from: data.humdata.org/dataset/wfp-food-prices-for-pakistan
// ─────────────────────────────────────────────────────

const HDX_BASE      = 'https://data.humdata.org/api/3/action/datastore_search';
const RESOURCE_ID   = 'bd8a9735-b4e0-4e29-9c58-a7fa57b0c6fe';
const CACHE_KEY     = 'mandi_hdx_v3';
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const TRANSPORT_PKR = 25; // PKR per km per maan (40 kg)

// ─────────────────────────────────────────────────────
// City GPS lookup
// ─────────────────────────────────────────────────────

const CITY_GPS: Record<string, { lat: number; lng: number; province: string }> = {
  'lahore':          { lat: 31.5204, lng: 74.3587, province: 'Punjab' },
  'karachi':         { lat: 24.8607, lng: 67.0011, province: 'Sindh' },
  'faisalabad':      { lat: 31.4504, lng: 73.1350, province: 'Punjab' },
  'multan':          { lat: 30.1575, lng: 71.5249, province: 'Punjab' },
  'rawalpindi':      { lat: 33.5651, lng: 73.0169, province: 'Punjab' },
  'islamabad':       { lat: 33.7294, lng: 73.0931, province: 'Punjab' },
  'peshawar':        { lat: 34.0151, lng: 71.5249, province: 'KPK' },
  'quetta':          { lat: 30.1798, lng: 66.9750, province: 'Balochistan' },
  'hyderabad':       { lat: 25.3960, lng: 68.3578, province: 'Sindh' },
  'sialkot':         { lat: 32.4945, lng: 74.5229, province: 'Punjab' },
  'gujranwala':      { lat: 32.1877, lng: 74.1945, province: 'Punjab' },
  'sargodha':        { lat: 32.0836, lng: 72.6711, province: 'Punjab' },
  'bahawalpur':      { lat: 29.3956, lng: 71.6836, province: 'Punjab' },
  'rahim yar khan':  { lat: 28.4212, lng: 70.2989, province: 'Punjab' },
  'sukkur':          { lat: 27.7052, lng: 68.8574, province: 'Sindh' },
  'larkana':         { lat: 27.5570, lng: 68.2148, province: 'Sindh' },
  'mardan':          { lat: 34.1986, lng: 72.0404, province: 'KPK' },
  'abbottabad':      { lat: 34.1463, lng: 73.2117, province: 'KPK' },
  'jhang':           { lat: 31.2681, lng: 72.3181, province: 'Punjab' },
  'sahiwal':         { lat: 30.6682, lng: 73.1068, province: 'Punjab' },
  'okara':           { lat: 30.8099, lng: 73.4458, province: 'Punjab' },
  'gujrat':          { lat: 32.5744, lng: 74.0790, province: 'Punjab' },
  'sheikhupura':     { lat: 31.7167, lng: 73.9850, province: 'Punjab' },
  'kasur':           { lat: 31.1167, lng: 74.4500, province: 'Punjab' },
  'khanewal':        { lat: 30.3020, lng: 71.9320, province: 'Punjab' },
  'muzaffargarh':    { lat: 30.0704, lng: 71.1938, province: 'Punjab' },
  'mirpurkhas':      { lat: 25.5272, lng: 69.0124, province: 'Sindh' },
  'nawabshah':       { lat: 26.2442, lng: 68.4098, province: 'Sindh' },
  'khuzdar':         { lat: 27.8120, lng: 66.6160, province: 'Balochistan' },
  'turbat':          { lat: 25.9901, lng: 63.0620, province: 'Balochistan' },
  'chaman':          { lat: 30.9200, lng: 66.4500, province: 'Balochistan' },
  'dera ismail khan':{ lat: 31.8314, lng: 70.9019, province: 'KPK' },
  'mingora':         { lat: 34.7717, lng: 72.3600, province: 'KPK' },
};

function getCityGps(market: string, admin1?: string): { lat: number; lng: number; province: string } {
  const mLow = market.toLowerCase().trim();
  // Direct match
  if (CITY_GPS[mLow]) return CITY_GPS[mLow];
  // Partial match
  for (const [key, val] of Object.entries(CITY_GPS)) {
    if (mLow.includes(key) || key.includes(mLow)) return val;
  }
  // Fall back by province centre
  const prov = (admin1 ?? '').toLowerCase();
  if (prov.includes('sindh'))       return { lat: 25.3960, lng: 68.3578, province: 'Sindh' };
  if (prov.includes('kpk') || prov.includes('khyber'))
                                     return { lat: 34.0151, lng: 71.5249, province: 'KPK' };
  if (prov.includes('baloch'))       return { lat: 30.1798, lng: 66.9750, province: 'Balochistan' };
  return { lat: 31.5204, lng: 74.3587, province: 'Punjab' };
}

// ─────────────────────────────────────────────────────
// Commodity → crop key mapping
// ─────────────────────────────────────────────────────

const HDX_TO_CROP: Record<string, string> = {
  'wheat':                'wheat',
  'wheat (flour)':        'wheat',
  'wheat flour':          'wheat',
  'rice':                 'rice',
  'rice (irri-6)':        'rice',
  'rice (basmati)':       'rice',
  'rice (coarse)':        'rice',
  'maize':                'maize',
  'maize (white)':        'maize',
  'sorghum':              'sorghum',
  'millet':               'millet',
  'sugar':                'sugarcane',
  'sugar (granulated)':   'sugarcane',
  'sugarcane':            'sugarcane',
  'cotton':               'cotton',
  'tomatoes':             'tomato',
  'tomato':               'tomato',
  'onions':               'onion',
  'onion':                'onion',
  'potatoes':             'potato',
  'potato':               'potato',
  'garlic':               'garlic',
  'ginger':               'ginger',
  'spinach':              'spinach',
  'cauliflower':          'cauliflower',
  'cabbage':              'cabbage',
  'carrots':              'carrot',
  'carrot':               'carrot',
  'peas':                 'peas',
  'okra':                 'okra',
  'cucumber':             'cucumber',
  'mango':                'mango',
  'mangoes':              'mango',
  'banana':               'banana',
  'bananas':              'banana',
  'apples':               'apple',
  'apple':                'apple',
  'orange':               'orange',
  'oranges':              'orange',
  'grapes':               'grapes',
  'watermelon':           'watermelon',
  'chickpeas':            'chickpea',
  'chickpea':             'chickpea',
  'lentils':              'lentil',
  'lentils (red)':        'lentil',
  'lentil':               'lentil',
  'red chilli':           'chilli',
  'chilli':               'chilli',
  'chillies':             'chilli',
  'turmeric':             'turmeric',
  'groundnuts':           'groundnut',
  'groundnut':            'groundnut',
  'beans':                'kidney_bean',
  'moong':                'moong',
  'mung beans':           'moong',
};

function hdxCommodityToCropKey(commodity: string): string | null {
  const lower = commodity.toLowerCase().trim();
  if (HDX_TO_CROP[lower]) return HDX_TO_CROP[lower];
  for (const [key, val] of Object.entries(HDX_TO_CROP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return null;
}

// ─────────────────────────────────────────────────────
// Unit conversion: HDX unit → PKR per Maan (40 kg)
// ─────────────────────────────────────────────────────

function pricePerMaan(price: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'kg' || u === 'kgs' || u.includes('kilogram')) return price * 40;
  if (u.includes('100 kg'))                                  return price * 0.4;
  if (u.includes('mt') || u.includes('tonne'))               return price * 0.04;
  if (u.includes('50 kg'))                                   return price * 0.8;
  if (u.includes('40 kg') || u === 'maan' || u === 'maund') return price;
  // default: assume per kg
  return price * 40;
}

// ─────────────────────────────────────────────────────
// Fetch all Pakistan rows from HDX CKAN DataStore
// Uses SQL endpoint to get only the latest ~500 rows for Pakistan
// ─────────────────────────────────────────────────────

async function fetchHdxRows(): Promise<HdxRow[]> {
  // Fetch last 1000 rows sorted by date desc (latest data first)
  // HDX CKAN datastore_search supports limit, offset, sort
  const url = `${HDX_BASE}?resource_id=${RESOURCE_ID}&limit=1000&sort=date%20desc`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'FarmNest/1.0 (Android; Pakistan Agricultural App)',
    },
  });

  if (!response.ok) {
    throw new Error(`HDX API HTTP ${response.status}`);
  }

  const json: HdxApiResponse = await response.json();

  if (!json.success || !json.result?.records) {
    throw new Error('HDX API returned unexpected format');
  }

  return json.result.records;
}

// ─────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────

async function getCachedRows(forceRefresh: boolean): Promise<HdxRow[]> {
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < CACHE_TTL_MS) {
          return parsed.rows as HdxRow[];
        }
      }
    } catch {}
  }
  const rows = await fetchHdxRows();
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
  } catch {}
  return rows;
}

// ─────────────────────────────────────────────────────
// History cache (module-level)
// ─────────────────────────────────────────────────────

const _historyCache: Record<string, PriceHistory[]> = {};

// ─────────────────────────────────────────────────────
// Build MandiPrice[] for a specific crop from HDX rows
// ─────────────────────────────────────────────────────

function buildMandiPrices(rows: HdxRow[], cropKey: string): MandiPrice[] {
  const cropEntry = CROP_MAP[cropKey];

  // Filter matching rows
  const matching = rows.filter(r => {
    const mapped = hdxCommodityToCropKey(r.commodity);
    return mapped === cropKey && r.currency === 'PKR';
  });

  if (!matching.length) return [];

  // Sort newest first, deduplicate by market (keep latest record per market)
  matching.sort((a, b) => b.date.localeCompare(a.date));

  const seen = new Map<string, HdxRow>();
  for (const row of matching) {
    const key = `${row.market.toLowerCase()}_${cropKey}`;
    if (!seen.has(key)) seen.set(key, row);
  }

  const results: MandiPrice[] = [];
  for (const [, row] of seen) {
    const priceRaw = parseFloat(row.price);
    if (!priceRaw || priceRaw <= 0) continue;

    const avgPKR = Math.round(pricePerMaan(priceRaw, row.unit));
    if (avgPKR <= 0) continue;

    const geo = getCityGps(row.market, row.admin1);

    // Use latitude/longitude from HDX row if valid
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const finalLat = (lat && Math.abs(lat) > 0.1) ? lat : geo.lat;
    const finalLng = (lng && Math.abs(lng) > 0.1) ? lng : geo.lng;
    const province = row.admin1?.trim() || geo.province;

    results.push({
      id:          `hdx_${row._id}_${cropKey}`,
      mandiName:   `${row.market.trim()} Mandi`,
      city:        row.market.trim(),
      province,
      cropName:    cropKey,
      cropNameUr:  cropEntry?.labelUr ?? cropKey,
      minPrice:    Math.round(avgPKR * 0.90),
      maxPrice:    Math.round(avgPKR * 1.10),
      avgPrice:    avgPKR,
      unit:        'Maan (40 kg)',
      lastUpdated: row.date.split('T')[0],
      latitude:    finalLat,
      longitude:   finalLng,
    });
  }

  return results.sort((a, b) => b.avgPrice - a.avgPrice);
}

// ─────────────────────────────────────────────────────
// Build price history for a specific market + crop
// ─────────────────────────────────────────────────────

function buildPriceHistory(rows: HdxRow[], cropKey: string, market: string): PriceHistory[] {
  const mLow = market.replace(/ Mandi$/i, '').toLowerCase();
  const matching = rows.filter(r => {
    const mapped = hdxCommodityToCropKey(r.commodity);
    return mapped === cropKey &&
      r.currency === 'PKR' &&
      r.market.toLowerCase().includes(mLow);
  });

  const byDate: Record<string, number[]> = {};
  for (const row of matching) {
    const d = row.date.split('T')[0];
    const p = parseFloat(row.price);
    if (!p || p <= 0) continue;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(Math.round(pricePerMaan(p, row.unit)));
  }

  return Object.entries(byDate)
    .map(([date, prices]) => ({
      date,
      avgPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
    }))
    .filter(h => h.avgPrice > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
}

// ─────────────────────────────────────────────────────
// Haversine distance
// ─────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────
// Trend analysis
// ─────────────────────────────────────────────────────

export function analyzeTrend(history: PriceHistory[]): {
  direction: 'rising' | 'falling' | 'stable';
  percent: number;
  advice: 'sell_now' | 'wait' | 'monitor';
  reason: string;
  reasonUr: string;
} {
  if (history.length < 2) {
    return {
      direction: 'stable', percent: 0, advice: 'monitor',
      reason:   'Insufficient historical data to determine trend.',
      reasonUr: 'رجحان جاننے کے لیے کافی تاریخی ڈیٹا نہیں۔',
    };
  }
  const recent    = history.slice(-4);
  const older     = history.slice(0, -4);
  const recentAvg = recent.reduce((s, h) => s + h.avgPrice, 0) / recent.length;
  const olderAvg  = older.length > 0
    ? older.reduce((s, h) => s + h.avgPrice, 0) / older.length
    : recent[0].avgPrice;
  const pct = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;

  if (pct > 3) {
    return {
      direction: 'rising', percent: Math.abs(pct), advice: 'wait',
      reason:   `Prices rising (+${pct.toFixed(1)}%). Wait for a better rate.`,
      reasonUr: `قیمتیں بڑھ رہی ہیں (+${pct.toFixed(1)}%)۔ انتظار کریں۔`,
    };
  }
  if (pct < -3) {
    return {
      direction: 'falling', percent: Math.abs(pct), advice: 'sell_now',
      reason:   `Prices falling (${pct.toFixed(1)}%). Sell now to avoid further loss.`,
      reasonUr: `قیمتیں گر رہی ہیں (${pct.toFixed(1)}%)۔ ابھی بیچیں۔`,
    };
  }
  return {
    direction: 'stable', percent: Math.abs(pct), advice: 'monitor',
    reason:   'Market is stable. Monitor daily for price shifts.',
    reasonUr: 'بازار مستحکم ہے۔ روزانہ نگرانی کریں۔',
  };
}

// ─────────────────────────────────────────────────────
// Attach distance + trend to prices
// ─────────────────────────────────────────────────────

function attachUserDistance(
  prices: MandiPrice[],
  rows: HdxRow[],
  cropKey: string,
  userLat: number,
  userLng: number,
): MandiResult[] {
  return prices.map(p => {
    const distanceKm    = Math.max(1, Math.round(haversineKm(userLat, userLng, p.latitude, p.longitude)));
    const transportCost = Math.round(distanceKm * TRANSPORT_PKR);
    const netProfit     = p.avgPrice - transportCost;

    const histKey = `${p.mandiName}__${cropKey}`;
    if (!_historyCache[histKey]) {
      _historyCache[histKey] = buildPriceHistory(rows, cropKey, p.mandiName);
    }
    const trend = analyzeTrend(_historyCache[histKey]);

    return {
      ...p,
      distanceKm,
      transportCost,
      netProfit,
      trendPercent:   trend.percent,
      trendDirection: trend.direction,
    };
  });
}

// ─────────────────────────────────────────────────────
// Public: fetchMandiPrices
// ─────────────────────────────────────────────────────

export async function fetchMandiPrices(
  cropKey: string,
  userLat: number,
  userLng: number,
  forceRefresh = false,
): Promise<{ prices: MandiResult[]; fromCache: boolean; lastSync: string }> {
  const rows      = await getCachedRows(forceRefresh);
  const fromCache = !forceRefresh;
  const rawPrices = buildMandiPrices(rows, cropKey);

  const latestDate = rawPrices.length > 0
    ? rawPrices.map(p => p.lastUpdated).sort().reverse()[0]
    : new Date().toISOString().split('T')[0];

  const results = attachUserDistance(rawPrices, rows, cropKey, userLat, userLng);
  return { prices: results, fromCache, lastSync: latestDate };
}

// ─────────────────────────────────────────────────────
// Public: getMandiRecommendation
// ─────────────────────────────────────────────────────

export function getMandiRecommendation(results: MandiResult[], cropKey: string): MandiRecommendation {
  if (!results.length) {
    return {
      bestPriceMandi: null, nearestMandi: null, bestProfitMandi: null,
      trendAdvice:        'monitor',
      trendAdviceReason:  'No HDX/WFP data found for this crop in Pakistan.',
      trendAdviceReasonUr:'اس فصل کے لیے WFP/HDX کا ڈیٹا دستیاب نہیں۔',
      priceHistory: [],
    };
  }
  const bestPriceMandi  = [...results].sort((a, b) => b.avgPrice  - a.avgPrice)[0];
  const nearestMandi    = [...results].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const bestProfitMandi = [...results].sort((a, b) => b.netProfit  - a.netProfit)[0];

  const histKey = `${bestProfitMandi.mandiName}__${cropKey}`;
  const history = _historyCache[histKey] ?? [];
  const trend   = analyzeTrend(history);

  return {
    bestPriceMandi,
    nearestMandi,
    bestProfitMandi,
    trendAdvice:        trend.advice,
    trendAdviceReason:  trend.reason,
    trendAdviceReasonUr:trend.reasonUr,
    priceHistory:       history.slice(-14),
  };
}

// ─────────────────────────────────────────────────────
// Public: generatePriceHistory (used by screen)
// ─────────────────────────────────────────────────────

export function generatePriceHistory(cropKey: string, mandiName: string): PriceHistory[] {
  return _historyCache[`${mandiName}__${cropKey}`] ?? [];
}

// ─────────────────────────────────────────────────────
// Public: generateProvincePriceHistory (used by trend tab)
// ─────────────────────────────────────────────────────

export function generateProvincePriceHistory(
  cropKey: string,
  province: string,
  days: number = 14,
): { mandiName: string; city: string; history: PriceHistory[] }[] {
  const results: { mandiName: string; city: string; history: PriceHistory[] }[] = [];
  for (const [cacheKey, history] of Object.entries(_historyCache)) {
    if (!cacheKey.endsWith(`__${cropKey}`)) continue;
    const mandiName = cacheKey.replace(`__${cropKey}`, '');
    const city      = mandiName.replace(/ Mandi$/i, '');
    const cityLow   = city.toLowerCase();
    const geoEntry  = Object.entries(CITY_GPS).find(([k]) => cityLow.includes(k));
    const mandiProv = geoEntry ? geoEntry[1].province : 'Punjab';
    if (province !== 'All' && mandiProv !== province) continue;
    results.push({ mandiName, city, history: history.slice(-days) });
  }
  return results;
}

// ─────────────────────────────────────────────────────
// Public: searchCrops
// ─────────────────────────────────────────────────────

export function searchCrops(query: string): CropEntry[] {
  if (!query.trim()) return ALL_CROPS;
  const q = query.toLowerCase().trim();
  return ALL_CROPS.filter(c =>
    c.label.toLowerCase().includes(q) ||
    c.labelUr.includes(q) ||
    c.key.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q),
  );
}

// ─────────────────────────────────────────────────────
// All crops list
// ─────────────────────────────────────────────────────

export const ALL_CROPS: CropEntry[] = [
  // Grains
  { key: 'wheat',        label: 'Wheat',                 labelUr: 'گندم',          emoji: '🌾', category: 'grain' },
  { key: 'rice',         label: 'Rice',                  labelUr: 'چاول',          emoji: '🍚', category: 'grain' },
  { key: 'maize',        label: 'Maize / Corn',          labelUr: 'مکئی',          emoji: '🌽', category: 'grain' },
  { key: 'barley',       label: 'Barley',                labelUr: 'جَو',            emoji: '🌾', category: 'grain' },
  { key: 'sorghum',      label: 'Sorghum',               labelUr: 'جوار',          emoji: '🌾', category: 'grain' },
  { key: 'millet',       label: 'Millet / Bajra',        labelUr: 'باجرہ',         emoji: '🌾', category: 'grain' },
  // Cash Crops
  { key: 'sugarcane',    label: 'Sugarcane / Sugar',     labelUr: 'گنا / چینی',    emoji: '🎋', category: 'cash_crop' },
  { key: 'cotton',       label: 'Cotton',                labelUr: 'کپاس',          emoji: '🌿', category: 'cash_crop' },
  // Vegetables
  { key: 'tomato',       label: 'Tomato',                labelUr: 'ٹماٹر',         emoji: '🍅', category: 'vegetable' },
  { key: 'onion',        label: 'Onion',                 labelUr: 'پیاز',          emoji: '🧅', category: 'vegetable' },
  { key: 'potato',       label: 'Potato',                labelUr: 'آلو',           emoji: '🥔', category: 'vegetable' },
  { key: 'garlic',       label: 'Garlic',                labelUr: 'لہسن',          emoji: '🧄', category: 'vegetable' },
  { key: 'ginger',       label: 'Ginger',                labelUr: 'ادرک',          emoji: '🫚', category: 'vegetable' },
  { key: 'spinach',      label: 'Spinach',               labelUr: 'پالک',          emoji: '🥬', category: 'vegetable' },
  { key: 'cauliflower',  label: 'Cauliflower',           labelUr: 'گوبھی',         emoji: '🥦', category: 'vegetable' },
  { key: 'cabbage',      label: 'Cabbage',               labelUr: 'بند گوبھی',     emoji: '🥬', category: 'vegetable' },
  { key: 'carrot',       label: 'Carrot',                labelUr: 'گاجر',          emoji: '🥕', category: 'vegetable' },
  { key: 'peas',         label: 'Peas / Matar',          labelUr: 'مٹر',           emoji: '🫛', category: 'vegetable' },
  { key: 'okra',         label: 'Okra / Bhindi',         labelUr: 'بھنڈی',         emoji: '🌿', category: 'vegetable' },
  { key: 'cucumber',     label: 'Cucumber',              labelUr: 'کھیرا',         emoji: '🥒', category: 'vegetable' },
  { key: 'brinjal',      label: 'Brinjal / Eggplant',   labelUr: 'بینگن',         emoji: '🍆', category: 'vegetable' },
  { key: 'capsicum',     label: 'Capsicum',              labelUr: 'شملہ مرچ',      emoji: '🫑', category: 'vegetable' },
  { key: 'bitter_gourd', label: 'Bitter Gourd / Karela', labelUr: 'کریلہ',         emoji: '🥒', category: 'vegetable' },
  { key: 'bottle_gourd', label: 'Bottle Gourd / Lauki',  labelUr: 'لوکی',          emoji: '🥒', category: 'vegetable' },
  { key: 'pumpkin',      label: 'Pumpkin / Kaddu',       labelUr: 'کدو',           emoji: '🎃', category: 'vegetable' },
  { key: 'radish',       label: 'Radish / Mooli',        labelUr: 'مولی',          emoji: '🌿', category: 'vegetable' },
  { key: 'turnip',       label: 'Turnip / Shalgam',      labelUr: 'شلجم',          emoji: '🌿', category: 'vegetable' },
  { key: 'methi',        label: 'Fenugreek / Methi',     labelUr: 'میتھی',         emoji: '🌿', category: 'vegetable' },
  { key: 'coriander',    label: 'Coriander / Dhania',    labelUr: 'دھنیا',         emoji: '🌿', category: 'spice' },
  // Fruits
  { key: 'mango',        label: 'Mango',                 labelUr: 'آم',            emoji: '🥭', category: 'fruit' },
  { key: 'banana',       label: 'Banana',                labelUr: 'کیلا',          emoji: '🍌', category: 'fruit' },
  { key: 'apple',        label: 'Apple',                 labelUr: 'سیب',           emoji: '🍎', category: 'fruit' },
  { key: 'orange',       label: 'Orange / Kinu',         labelUr: 'کینو/مالٹا',    emoji: '🍊', category: 'fruit' },
  { key: 'grapes',       label: 'Grapes',                labelUr: 'انگور',         emoji: '🍇', category: 'fruit' },
  { key: 'guava',        label: 'Guava / Amrood',        labelUr: 'امرود',         emoji: '🍈', category: 'fruit' },
  { key: 'watermelon',   label: 'Watermelon',            labelUr: 'تربوز',         emoji: '🍉', category: 'fruit' },
  { key: 'melon',        label: 'Melon / Kharbooza',     labelUr: 'خربوزہ',        emoji: '🍈', category: 'fruit' },
  { key: 'pomegranate',  label: 'Pomegranate / Anar',    labelUr: 'انار',          emoji: '🍎', category: 'fruit' },
  { key: 'lemon',        label: 'Lemon / Limoo',         labelUr: 'لیموں',         emoji: '🍋', category: 'fruit' },
  { key: 'date',         label: 'Date / Khajoor',        labelUr: 'کھجور',         emoji: '🌴', category: 'fruit' },
  { key: 'peach',        label: 'Peach / Aaru',          labelUr: 'آڑو',           emoji: '🍑', category: 'fruit' },
  { key: 'apricot',      label: 'Apricot / Khubani',     labelUr: 'خوبانی',        emoji: '🍑', category: 'fruit' },
  { key: 'pear',         label: 'Pear / Naashpati',      labelUr: 'ناشپاتی',       emoji: '🍐', category: 'fruit' },
  // Pulses
  { key: 'chickpea',     label: 'Chickpea / Chana',      labelUr: 'چنا',           emoji: '🫘', category: 'pulse' },
  { key: 'lentil',       label: 'Lentil / Masoor Dal',   labelUr: 'مسور دال',      emoji: '🫘', category: 'pulse' },
  { key: 'moong',        label: 'Moong Dal',             labelUr: 'مونگ دال',      emoji: '🫘', category: 'pulse' },
  { key: 'mash',         label: 'Mash Dal / Urad',       labelUr: 'ماش دال',       emoji: '🫘', category: 'pulse' },
  { key: 'kidney_bean',  label: 'Kidney Bean / Rajma',   labelUr: 'راجمہ',         emoji: '🫘', category: 'pulse' },
  // Spices
  { key: 'chilli',       label: 'Red Chilli / Lal Mirch',labelUr: 'لال مرچ',       emoji: '🌶️', category: 'spice' },
  { key: 'turmeric',     label: 'Turmeric / Haldi',      labelUr: 'ہلدی',          emoji: '🟡', category: 'spice' },
  { key: 'cumin',        label: 'Cumin / Zeera',         labelUr: 'زیرہ',          emoji: '🌿', category: 'spice' },
  // Oilseeds
  { key: 'sunflower',    label: 'Sunflower Seed',        labelUr: 'سورج مکھی',     emoji: '🌻', category: 'oilseed' },
  { key: 'canola',       label: 'Canola / Rapeseed',     labelUr: 'سرسوں',         emoji: '🌿', category: 'oilseed' },
  { key: 'sesame',       label: 'Sesame / Til',          labelUr: 'تل',            emoji: '🌿', category: 'oilseed' },
  { key: 'groundnut',    label: 'Groundnut / Mungphali', labelUr: 'مونگ پھلی',     emoji: '🥜', category: 'oilseed' },
];

const CROP_MAP: Record<string, CropEntry> = {};
ALL_CROPS.forEach(c => { CROP_MAP[c.key] = c; });

// ─────────────────────────────────────────────────────
// MANDI_LOCATIONS export (for GPS navigation)
// ─────────────────────────────────────────────────────

export const MANDI_LOCATIONS: Record<string, { lat: number; lng: number; province: string; city: string }> = {
  'Lahore Mandi':        { lat: 31.5204, lng: 74.3587, province: 'Punjab',      city: 'Lahore' },
  'Karachi Mandi':       { lat: 24.8607, lng: 67.0011, province: 'Sindh',       city: 'Karachi' },
  'Faisalabad Mandi':    { lat: 31.4504, lng: 73.1350, province: 'Punjab',      city: 'Faisalabad' },
  'Multan Mandi':        { lat: 30.1575, lng: 71.5249, province: 'Punjab',      city: 'Multan' },
  'Rawalpindi Mandi':    { lat: 33.5651, lng: 73.0169, province: 'Punjab',      city: 'Rawalpindi' },
  'Peshawar Mandi':      { lat: 34.0151, lng: 71.5249, province: 'KPK',         city: 'Peshawar' },
  'Quetta Mandi':        { lat: 30.1798, lng: 66.9750, province: 'Balochistan', city: 'Quetta' },
  'Hyderabad Mandi':     { lat: 25.3960, lng: 68.3578, province: 'Sindh',       city: 'Hyderabad' },
  'Islamabad Mandi':     { lat: 33.7294, lng: 73.0931, province: 'Punjab',      city: 'Islamabad' },
  'Gujranwala Mandi':    { lat: 32.1877, lng: 74.1945, province: 'Punjab',      city: 'Gujranwala' },
};
