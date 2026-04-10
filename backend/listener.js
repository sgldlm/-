import dotenv from "dotenv";
import { loadConfig, loadDedupe, saveDedupe } from "./src/state.js";

dotenv.config();

const BACKEND_SIGNAL_URL = `http://127.0.0.1:${process.env.PORT || 8787}/signal`;
const POLL_MS = Number(process.env.POLL_MS || 5000);

function now() { return new Date().toISOString(); }

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}

async function postSignal(signal) {
  await fetch(BACKEND_SIGNAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signal)
  });
}

function uniqueKey(traderAddress, t, source) {
  return [traderAddress.toLowerCase(), source, t.timestamp || "", t.slug || t.market_slug || t.title || "", t.side || t.outcome || "", t.price || "", t.size || t.amount || ""].join("|");
}
function normalizeSignal(trader, t, source) {
  return {
    traderAddress: trader.address,
    traderName: trader.name,
    marketSlug: t.slug || t.market_slug || t.title || "unknown-market",
    positionSide: String(t.side || t.outcome || "UNKNOWN").toUpperCase(),
    price: Number(t.price || 0),
    amount: Number(t.size || t.amount || 0),
    action: String(t.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    timestamp: t.timestamp || null,
    source,
    raw: t
  };
}
async function fetchTrades(address, limit = 20) { return await getJson(`https://data-api.polymarket.com/trades?user=${encodeURIComponent(address)}&limit=${limit}`); }
async function fetchActivity(address, limit = 20) { return await getJson(`https://data-api.polymarket.com/activity?user=${encodeURIComponent(address)}&limit=${limit}`); }

async function run() {
  console.log(now(), `Listener started, polling every ${POLL_MS}ms`);
  while (true) {
    const config = loadConfig();
    const watch = (config.traders || []).map(t => ({ name: t.name, address: t.address }));
    const dedupe = loadDedupe();

    for (const trader of watch) {
      try {
        const tradesRaw = await fetchTrades(trader.address, 20);
        const trades = Array.isArray(tradesRaw) ? tradesRaw : (tradesRaw.data || tradesRaw.trades || []);
        for (const t of trades.reverse()) {
          const key = uniqueKey(trader.address, t, "polymarket-api/trades");
          if (dedupe.seen[key]) continue;
          dedupe.seen[key] = Date.now();
          await postSignal(normalizeSignal(trader, t, "polymarket-api/trades"));
        }
      } catch (err) { console.error(now(), "[TRADES ERROR]", trader.name, err.message); }

      try {
        const actsRaw = await fetchActivity(trader.address, 20);
        const acts = Array.isArray(actsRaw) ? actsRaw : (actsRaw.data || actsRaw.activity || []);
        for (const t of acts.reverse()) {
          const key = uniqueKey(trader.address, t, "polymarket-api/activity");
          if (dedupe.seen[key]) continue;
          dedupe.seen[key] = Date.now();
          await postSignal(normalizeSignal(trader, t, "polymarket-api/activity"));
        }
      } catch (err) { console.error(now(), "[ACTIVITY ERROR]", trader.name, err.message); }
    }

    const trimmed = Object.entries(dedupe.seen).sort((a, b) => b[1] - a[1]).slice(0, 8000);
    dedupe.seen = Object.fromEntries(trimmed);
    saveDedupe(dedupe);
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
run().catch(err => { console.error(err); process.exit(1); });