export function evaluateSignal(signal, config, state) {
  const trader = (config.traders || []).find(
    t => t.enabled && String(t.address).toLowerCase() === String(signal.traderAddress || "").toLowerCase()
  );
  if (!trader) return { ok: false, reason: "交易员未启用" };
  const global = config.global || {};
  const amount = Number(signal.amount || 0);
  const price = Number(signal.price || 0);
  const side = String(signal.positionSide || "").toUpperCase();
  const action = String(signal.action || "BUY").toUpperCase();

  if (amount < Number(global.min_source_trade || 0)) return { ok: false, reason: "源交易金额低于阈值" };
  if (global.side_filter && global.side_filter !== "all" && side !== String(global.side_filter).toUpperCase()) return { ok: false, reason: "方向被过滤" };
  if (global.follow_sell === false && action === "SELL") return { ok: false, reason: "已关闭跟卖" };
  if (global.probability_band === "high" && !(price >= 0.70 && price <= 0.95)) return { ok: false, reason: "不在高概率区间" };
  if (global.probability_band === "mid" && !(price >= 0.30 && price <= 0.70)) return { ok: false, reason: "不在中概率区间" };
  if (global.probability_band === "low" && !(price >= 0.01 && price < 0.30)) return { ok: false, reason: "不在低概率区间" };

  const copyAmount = Math.min(
    amount * Number(trader.copy_ratio || 0),
    Number(trader.max_per_trade || Number.MAX_SAFE_INTEGER),
    Number(global.max_per_trade || Number.MAX_SAFE_INTEGER)
  );
  if (!(copyAmount > 0)) return { ok: false, reason: "计算后的建议金额为零" };
  const daily = Number(state.dailySpent || 0) + copyAmount;
  if (daily > Number(global.daily_cap || Number.MAX_SAFE_INTEGER)) return { ok: false, reason: "超过每日上限" };
  const marketExposure = Number(state.marketExposure?.[signal.marketSlug] || 0) + copyAmount;
  if (marketExposure > Number(global.max_per_market || Number.MAX_SAFE_INTEGER)) return { ok: false, reason: "超过单市场上限" };

  return { ok: true, trader, copyAmount: Number(copyAmount.toFixed(2)) };
}
export function hydrateOrderFromSignal(signal, decision, config) {
  return {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    traderName: signal.traderName,
    traderAddress: signal.traderAddress,
    marketSlug: signal.marketSlug,
    positionSide: String(signal.positionSide || "UNKNOWN").toUpperCase(),
    action: String(signal.action || "BUY").toUpperCase(),
    price: Number(signal.price || 0),
    sourceAmount: Number(signal.amount || 0),
    copyAmount: decision.copyAmount,
    detectedAt: new Date().toISOString(),
    source: signal.source || "listener",
    slippageBps: Number(config.global?.max_slippage_bps || 100)
  };
}