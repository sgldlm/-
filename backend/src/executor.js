import dotenv from "dotenv";
import { Wallet } from "ethers";
import { ClobClient, OrderType, Side } from "@polymarket/clob-client";
import { resolveMarketBySlug, chooseTokenIdForPosition, getMarketMetaForToken } from "./market-resolver.js";

dotenv.config();
const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

export function loadTradingEnv() {
  return {
    privateKey: process.env.PRIVATE_KEY || "",
    funderAddress: process.env.FUNDER_ADDRESS || "",
    signatureType: Number(process.env.SIGNATURE_TYPE || 2),
    apiKey: process.env.POLY_API_KEY || "",
    apiSecret: process.env.POLY_API_SECRET || "",
    apiPassphrase: process.env.POLY_API_PASSPHRASE || "",
    orderType: process.env.ORDER_TYPE || "GTC"
  };
}
export function validateTradingEnv(env) {
  const missing = [];
  if (!env.privateKey) missing.push("PRIVATE_KEY");
  if (!env.funderAddress) missing.push("FUNDER_ADDRESS");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}
async function buildClient(env) {
  const signer = new Wallet(env.privateKey);
  let creds = null;
  if (env.apiKey && env.apiSecret && env.apiPassphrase) {
    creds = { key: env.apiKey, secret: env.apiSecret, passphrase: env.apiPassphrase };
  } else {
    const bootstrap = new ClobClient(HOST, CHAIN_ID, signer);
    creds = await bootstrap.createOrDeriveApiKey();
  }
  return new ClobClient(HOST, CHAIN_ID, signer, creds, env.signatureType, env.funderAddress);
}
function orderTypeFromEnv(orderType) {
  const key = String(orderType || "GTC").toUpperCase();
  return OrderType[key] || OrderType.GTC;
}
function bumpBuyPrice(price, bps) {
  const p = Number(price || 0.5);
  const next = p + p * (Number(bps || 0) / 10000);
  return Number(Math.min(0.99, Math.max(0.01, next)).toFixed(4));
}
function sideFromPosition(_positionSide) { return Side.BUY; }

export async function executeCopyOrder(order, env) {
  validateTradingEnv(env);
  const client = await buildClient(env);
  const market = await resolveMarketBySlug(order.marketSlug);
  const tokenID = chooseTokenIdForPosition(market, order.positionSide);
  if (!tokenID) throw new Error(`Unable to resolve tokenID for ${order.marketSlug} / ${order.positionSide}`);
  const meta = await getMarketMetaForToken(client, tokenID, market);
  const price = bumpBuyPrice(order.price, order.slippageBps || 100);
  const response = await client.createAndPostOrder(
    { tokenID, price, size: Number(order.copyAmount), side: sideFromPosition(order.positionSide) },
    { tickSize: meta.tickSize, negRisk: meta.negRisk },
    orderTypeFromEnv(env.orderType)
  );
  return { ok: true, tokenID, limitPrice: price, tickSize: meta.tickSize, negRisk: meta.negRisk, response };
}