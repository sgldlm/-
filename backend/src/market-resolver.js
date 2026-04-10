const GAMMA = "https://gamma-api.polymarket.com";
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}
function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(",").map(x => x.trim()).filter(Boolean);
  }
}
export async function resolveMarketBySlug(slug) { return await getJson(`${GAMMA}/markets/slug/${encodeURIComponent(slug)}`); }
function outcomeTokenMap(market) {
  const ids = parseMaybeJsonArray(market.clobTokenIds);
  const outcomes = parseMaybeJsonArray(market.outcomes);
  const map = {};
  if (ids.length && outcomes.length && ids.length === outcomes.length) {
    for (let i = 0; i < ids.length; i++) map[String(outcomes[i]).toUpperCase()] = ids[i];
  }
  if (market.tokenID && !map.YES) map.YES = market.tokenID;
  return map;
}
export function chooseTokenIdForPosition(market, positionSide) {
  const side = String(positionSide || "").toUpperCase();
  const map = outcomeTokenMap(market);
  if (side === "YES" && map.YES) return map.YES;
  if (side === "NO" && map.NO) return map.NO;
  const ids = parseMaybeJsonArray(market.clobTokenIds);
  if (ids.length === 1) return ids[0];
  if (ids.length >= 2) return side === "NO" ? ids[1] : ids[0];
  return null;
}
export async function getMarketMetaForToken(client, tokenID, market) {
  let tickSize = market.tickSize || "0.01";
  let negRisk = Boolean(market.negRisk || false);
  try { tickSize = await client.getTickSize(tokenID); } catch {}
  try { negRisk = await client.getNegRisk(tokenID); } catch {}
  return { tickSize, negRisk };
}