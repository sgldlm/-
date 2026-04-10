import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const DEDUPE_PATH = path.join(DATA_DIR, "dedupe.json");

export function ensureDataDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function now() { return new Date().toISOString(); }

export function defaultConfig() {
  return {
    mode: "semi",
    global: {
      copy_ratio: 0.18,
      max_per_trade: 150,
      max_per_market: 300,
      daily_cap: 500,
      min_source_trade: 200,
      side_filter: "all",
      probability_band: "all",
      follow_sell: true,
      max_slippage_bps: 100
    },
    traders: [
      {"category":"科技","name":"Mujurry","labelZh":"Mujurry（科技）","address":"0x5ecde7348ea5100af4360dd7a6e0a3fb1d420787","enabled":true,"copy_ratio":0.08,"max_per_trade":80,"risk":"high"},
      {"category":"文化","name":"Big.Chungus","labelZh":"Big.Chungus（文化）","address":"0x06dcaa14f57d8a0573f5dc5940565e6de667af59","enabled":true,"copy_ratio":0.20,"max_per_trade":150,"risk":"mid"},
      {"category":"文化","name":"GUHHH","labelZh":"GUHHH（文化）","address":"0x033dc6e3e3e0a3ae55402576990392ae910aaf05","enabled":true,"copy_ratio":0.22,"max_per_trade":160,"risk":"low"},
      {"category":"文化","name":"BeN","labelZh":"BeN（文化）","address":"0x668d85d791049bf0100e557a72c7ed4dc97297d2","enabled":true,"copy_ratio":0.18,"max_per_trade":140,"risk":"low"},
      {"category":"文化","name":"pol76","labelZh":"pol76（文化）","address":"0x36e7e560c4d4cf32926906d939a18cf91f8a0b6b","enabled":true,"copy_ratio":0.18,"max_per_trade":130,"risk":"low"},
      {"category":"体育","name":"middleoftheocean","labelZh":"middleoftheocean（体育）","address":"0x6c743aafd813475986dcd930f380a1f50901bd4e","enabled":true,"copy_ratio":0.16,"max_per_trade":120,"risk":"mid"}
    ]
  };
}
export function defaultState() {
  return {
    createdAt: now(),
    updatedAt: now(),
    feed: [],
    pending: [],
    executed: [],
    rejected: [],
    metrics: { received: 0, accepted: 0, rejected: 0, executed: 0, pending: 0 },
    marketExposure: {},
    dailySpent: 0,
    lastResetDate: new Date().toISOString().slice(0, 10)
  };
}
export function defaultDedupe() { return { seen: {} }; }

function readJson(filePath, fallback) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return structuredClone(fallback);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
function writeJson(filePath, value) { ensureDataDir(); fs.writeFileSync(filePath, JSON.stringify(value, null, 2)); }

export function loadConfig() { return readJson(CONFIG_PATH, defaultConfig()); }
export function saveConfig(config) { writeJson(CONFIG_PATH, config); }
export function loadState() {
  const state = readJson(STATE_PATH, defaultState());
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastResetDate !== today) {
    state.dailySpent = 0;
    state.marketExposure = {};
    state.lastResetDate = today;
    saveState(state);
  }
  return state;
}
export function saveState(state) { state.updatedAt = now(); state.metrics.pending = state.pending.length; writeJson(STATE_PATH, state); }
export function loadDedupe() { return readJson(DEDUPE_PATH, defaultDedupe()); }
export function saveDedupe(dedupe) { writeJson(DEDUPE_PATH, dedupe); }