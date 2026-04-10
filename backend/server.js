import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { executeCopyOrder, loadTradingEnv, validateTradingEnv } from "./src/executor.js";
import { evaluateSignal, hydrateOrderFromSignal } from "./src/risk.js";
import { ensureDataDir, loadConfig, saveConfig, loadState, saveState } from "./src/state.js";

dotenv.config();
ensureDataDir();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 8787);
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() === "true";

function now() { return new Date().toISOString(); }
function pushFeed(state, item) {
  state.feed.unshift({ id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...item });
  state.feed = state.feed.slice(0, 800);
}

app.get("/health", (_req, res) => {
  let tradingReady = false;
  let tradingError = null;
  if (!DRY_RUN) {
    try { validateTradingEnv(loadTradingEnv()); tradingReady = true; } catch (err) { tradingError = err.message; }
  }
  res.json({ ok: true, dryRun: DRY_RUN, tradingReady, tradingError, time: now() });
});
app.get("/state", (_req, res) => res.json(loadState()));
app.get("/config", (_req, res) => res.json(loadConfig()));
app.post("/config", (req, res) => { saveConfig(req.body); res.json({ ok: true }); });

app.post("/signal", async (req, res) => {
  const signal = req.body || {};
  const state = loadState();
  const config = loadConfig();

  state.metrics.received += 1;
  pushFeed(state, { at: now(), stage: "received", traderName: signal.traderName || "Unknown", traderAddress: signal.traderAddress || "", marketSlug: signal.marketSlug || "unknown-market", action: signal.action || "BUY", side: signal.positionSide || "UNKNOWN", amount: Number(signal.amount || 0), price: Number(signal.price || 0), source: signal.source || "listener" });

  const decision = evaluateSignal(signal, config, state);
  if (!decision.ok) {
    state.metrics.rejected += 1;
    state.rejected.unshift({ at: now(), signal, reason: decision.reason });
    state.rejected = state.rejected.slice(0, 400);
    pushFeed(state, { at: now(), stage: "rejected", traderName: signal.traderName || "Unknown", traderAddress: signal.traderAddress || "", marketSlug: signal.marketSlug || "unknown-market", action: signal.action || "BUY", side: signal.positionSide || "UNKNOWN", amount: Number(signal.amount || 0), price: Number(signal.price || 0), source: signal.source || "listener", reason: decision.reason });
    saveState(state);
    return res.json({ ok: false, stage: "rejected", reason: decision.reason });
  }

  const order = hydrateOrderFromSignal(signal, decision, config);
  state.metrics.accepted += 1;

  if (config.mode === "manual" || config.mode === "semi") {
    state.pending.unshift(order);
    state.pending = state.pending.slice(0, 400);
    pushFeed(state, { at: now(), stage: config.mode === "manual" ? "pending_manual" : "pending_execute", traderName: order.traderName, traderAddress: order.traderAddress, marketSlug: order.marketSlug, action: order.action, side: order.positionSide, amount: order.copyAmount, price: order.price, source: order.source });
    saveState(state);
    return res.json({ ok: true, stage: config.mode, order });
  }

  try {
    const result = DRY_RUN ? { ok: true, dryRun: true, simulated: true } : await executeCopyOrder(order, loadTradingEnv());
    state.executed.unshift({ at: now(), order, result });
    state.executed = state.executed.slice(0, 400);
    state.dailySpent += Number(order.copyAmount || 0);
    state.marketExposure[order.marketSlug] = Number(state.marketExposure[order.marketSlug] || 0) + Number(order.copyAmount || 0);
    state.metrics.executed += 1;
    pushFeed(state, { at: now(), stage: "executed_auto", traderName: order.traderName, traderAddress: order.traderAddress, marketSlug: order.marketSlug, action: order.action, side: order.positionSide, amount: order.copyAmount, price: order.price, source: order.source });
    saveState(state);
    return res.json({ ok: true, stage: "executed_auto", result });
  } catch (err) {
    state.rejected.unshift({ at: now(), signal, reason: err.message });
    state.rejected = state.rejected.slice(0, 400);
    pushFeed(state, { at: now(), stage: "execute_error", traderName: order.traderName, traderAddress: order.traderAddress, marketSlug: order.marketSlug, action: order.action, side: order.positionSide, amount: order.copyAmount, price: order.price, source: order.source, reason: err.message });
    saveState(state);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/execute", async (req, res) => {
  const state = loadState();
  const index = Number((req.body || {}).index || 0);
  if (!state.pending.length) return res.status(404).json({ ok: false, error: "No pending order." });
  if (index < 0 || index >= state.pending.length) return res.status(400).json({ ok: false, error: "Invalid index." });

  const order = state.pending[index];
  try {
    const result = DRY_RUN ? { ok: true, dryRun: true, simulated: true } : await executeCopyOrder(order, loadTradingEnv());
    state.pending.splice(index, 1);
    state.executed.unshift({ at: now(), order, result });
    state.executed = state.executed.slice(0, 400);
    state.dailySpent += Number(order.copyAmount || 0);
    state.marketExposure[order.marketSlug] = Number(state.marketExposure[order.marketSlug] || 0) + Number(order.copyAmount || 0);
    state.metrics.executed += 1;
    pushFeed(state, { at: now(), stage: "executed_manual", traderName: order.traderName, traderAddress: order.traderAddress, marketSlug: order.marketSlug, action: order.action, side: order.positionSide, amount: order.copyAmount, price: order.price, source: order.source });
    saveState(state);
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/reset", (_req, res) => {
  const state = loadState();
  state.feed = []; state.pending = []; state.executed = []; state.rejected = [];
  state.metrics = { received: 0, accepted: 0, rejected: 0, executed: 0, pending: 0 };
  state.marketExposure = {}; state.dailySpent = 0;
  saveState(state);
  res.json({ ok: true });
});

app.get("/", (_req, res) => res.sendFile(path.resolve("public/dashboard.html")));
app.listen(PORT, () => console.log(`GitHub mobile bundle backend running at http://127.0.0.1:${PORT} | dryRun=${DRY_RUN}`));