import { logger } from "../lib/logger.js";

// ── Coin ID mapping (CoinGecko IDs) ──────────────────────────────────────────
const COIN_MAP: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum",
  sol: "solana", solana: "solana",
  bnb: "binancecoin", binancecoin: "binancecoin",
  xrp: "ripple", ripple: "ripple",
  ada: "cardano", cardano: "cardano",
  avax: "avalanche-2", avalanche: "avalanche-2",
  dot: "polkadot", polkadot: "polkadot",
  matic: "matic-network", polygon: "matic-network",
  link: "chainlink", chainlink: "chainlink",
  uni: "uniswap", uniswap: "uniswap",
  atom: "cosmos", cosmos: "cosmos",
  ltc: "litecoin", litecoin: "litecoin",
  doge: "dogecoin", dogecoin: "dogecoin",
  shib: "shiba-inu", "shiba inu": "shiba-inu", shiba: "shiba-inu",
  pepe: "pepe", floki: "floki",
  wif: "dogwifcoin", "dog wif hat": "dogwifcoin",
  bonk: "bonk", popcat: "popcat",
  sui: "sui", apt: "aptos", aptos: "aptos",
  op: "optimism", optimism: "optimism",
  arb: "arbitrum", arbitrum: "arbitrum",
  jup: "jupiter-exchange-solana", jupiter: "jupiter-exchange-solana",
  ray: "raydium", raydium: "raydium",
  jto: "jito-governance-token", jito: "jito-governance-token",
  pyth: "pyth-network",
  pengu: "pudgy-penguins",
  trump: "official-trump",
  virtual: "virtual-protocol",
  ai16z: "ai16z",
  fartcoin: "fartcoin",
  zerebro: "zerebro",
};

// Crypto intent keywords
const CRYPTO_KEYWORDS = [
  "price", "pump", "dump", "moon", "rug", "chart", "volume", "market cap",
  "marketcap", "mcap", "ath", "atl", "dip", "rekt", "bullish", "bearish",
  "token", "coin", "crypto", "blockchain", "defi", "nft", "wallet", "trade",
  "buy", "sell", "hold", "hodl", "liquidat", "perp", "spot", "alt", "altcoin",
  "meme coin", "memecoin", "up", "down", "crash", "rally", "trending", "ticker",
  "24h", "7d", "candle", "support", "resistance", "dex", "cex", "liquidity",
];

// ── Detect which CoinGecko IDs are relevant to the question ──────────────────
export function detectCoinIds(question: string): string[] {
  const lower = question.toLowerCase();
  const found = new Set<string>();
  for (const [keyword, id] of Object.entries(COIN_MAP)) {
    if (lower.includes(keyword)) found.add(id);
  }
  return [...found].slice(0, 6); // max 6 coins
}

// ── Detect crypto intent ──────────────────────────────────────────────────────
export function isCryptoQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  // If a coin name is mentioned
  if (detectCoinIds(question).length > 0) return true;
  // If crypto keywords present
  return CRYPTO_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── CoinGecko: fetch price data for specific coins ───────────────────────────
interface CoinGeckoPrice {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
}

async function fetchCoinGeckoPrices(ids: string[]): Promise<Record<string, CoinGeckoPrice> | null> {
  if (ids.length === 0) return null;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json() as Record<string, CoinGeckoPrice>;
  } catch {
    return null;
  }
}

// ── CoinGecko: top 10 by market cap ──────────────────────────────────────────
interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
}

async function fetchTopCoins(): Promise<CoinMarket[] | null> {
  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false";
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json() as CoinMarket[];
  } catch {
    return null;
  }
}

// ── DexScreener: search for a token (for smaller/meme coins) ─────────────────
interface DexPair {
  baseToken: { name: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  chainId: string;
  dexId: string;
  fdv?: number;
}

async function fetchDexScreener(query: string): Promise<DexPair | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json() as { pairs?: DexPair[] };
    // Return the highest liquidity pair
    const pairs = data.pairs ?? [];
    if (pairs.length === 0) return null;
    return pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  } catch {
    return null;
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.001) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function formatChange(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatLarge(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Main: build crypto context for AI ────────────────────────────────────────
export async function getCryptoContext(question: string): Promise<string> {
  const coinIds = detectCoinIds(question);
  const isMarketOverview = /market|top|trending|overview|all|overall/i.test(question);

  const parts: string[] = [];

  // Specific coins mentioned → CoinGecko
  if (coinIds.length > 0) {
    const [prices, topCoins] = await Promise.all([
      fetchCoinGeckoPrices(coinIds),
      isMarketOverview ? fetchTopCoins() : Promise.resolve(null),
    ]);

    if (prices) {
      const lines = Object.entries(prices).map(([id, data]) => {
        const symbol = Object.entries(COIN_MAP).find(([, v]) => v === id)?.[0]?.toUpperCase() ?? id.toUpperCase();
        const change = data.usd_24h_change != null ? ` (${formatChange(data.usd_24h_change)} 24h)` : "";
        const mcap   = data.usd_market_cap ? ` | MCap: ${formatLarge(data.usd_market_cap)}` : "";
        const vol    = data.usd_24h_vol    ? ` | Vol 24h: ${formatLarge(data.usd_24h_vol)}` : "";
        return `${symbol}: ${formatPrice(data.usd)}${change}${mcap}${vol}`;
      });
      parts.push("LIVE PRICES:\n" + lines.join("\n"));
    }

    // For meme coins not in CoinGecko top list, try DexScreener
    const lowerQ = question.toLowerCase();
    const dexKeywords = ["pepe", "wif", "bonk", "popcat", "floki", "shib", "fart", "bome", "mog", "brett", "toshi"];
    const dexTarget = dexKeywords.find((k) => lowerQ.includes(k));
    if (dexTarget) {
      const pair = await fetchDexScreener(dexTarget);
      if (pair) {
        const change = pair.priceChange?.h24 != null ? ` (${formatChange(pair.priceChange.h24)} 24h)` : "";
        const vol    = pair.volume?.h24     != null ? ` | Vol: ${formatLarge(pair.volume.h24)}` : "";
        const liq    = pair.liquidity?.usd  != null ? ` | Liq: ${formatLarge(pair.liquidity.usd)}` : "";
        const fdv    = pair.fdv             != null ? ` | FDV: ${formatLarge(pair.fdv)}` : "";
        parts.push(`DEX DATA (${pair.chainId.toUpperCase()} / ${pair.dexId}):\n${pair.baseToken.symbol}: ${pair.priceUsd ? formatPrice(parseFloat(pair.priceUsd)) : "N/A"}${change}${vol}${liq}${fdv}`);
      }
    }

    if (topCoins && isMarketOverview) {
      const topLines = topCoins.map((c) =>
        `${c.symbol.toUpperCase()}: ${formatPrice(c.current_price)} (${formatChange(c.price_change_percentage_24h)} 24h)`,
      );
      parts.push("TOP 10 BY MARKET CAP:\n" + topLines.join("\n"));
    }
  } else if (isMarketOverview) {
    // No specific coin but asking about market in general
    const topCoins = await fetchTopCoins();
    if (topCoins) {
      const topLines = topCoins.map((c) =>
        `${c.symbol.toUpperCase()}: ${formatPrice(c.current_price)} (${formatChange(c.price_change_percentage_24h)} 24h)`,
      );
      parts.push("TOP 10 BY MARKET CAP:\n" + topLines.join("\n"));
    }
  } else {
    // Generic crypto question — try DexScreener search on the original question words
    const words = question.split(/\s+/).filter((w) => w.length > 2).slice(0, 2);
    if (words.length > 0) {
      const pair = await fetchDexScreener(words.join(" "));
      if (pair) {
        const change = pair.priceChange?.h24 != null ? ` (${formatChange(pair.priceChange.h24)} 24h)` : "";
        parts.push(`DEX DATA:\n${pair.baseToken.name} (${pair.baseToken.symbol}): ${pair.priceUsd ? formatPrice(parseFloat(pair.priceUsd)) : "N/A"}${change}`);
      }
    }
  }

  if (parts.length === 0) return "";

  const context = `\n[LIVE CRYPTO DATA — ${new Date().toUTCString()}]\n${parts.join("\n\n")}\n[Use this data directly in your answer. Be specific with numbers. Never say you don't have real-time data.]\n`;
  logger.info({ coinIds, parts: parts.length }, "Crypto context fetched");
  return context;
}
