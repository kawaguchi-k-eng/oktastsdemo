/**
 * 環境変数の読み出し。
 * Python版の os.environ[...] / os.environ.get(...) に相当する。
 */

import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export function optional(name: string, fallback = ""): string {
  return (process.env[name] ?? "").trim() || fallback;
}

let cachedKey: KeyObject | null = null;

/**
 * AI Agentの秘密鍵を読み込む。
 * Amplifyではファイルを配置できないので、環境変数(PEM文字列 or Base64)を優先し、
 * ローカル開発用にファイルパス指定(OKTA_AGENT_PRIVATE_KEY_PATH)も残す。
 * PKCS#8 ("BEGIN PRIVATE KEY") / PKCS#1 ("BEGIN RSA PRIVATE KEY") のどちらでも可。
 */
export function agentPrivateKey(): KeyObject {
  if (cachedKey) return cachedKey;

  let pem = optional("OKTA_AGENT_PRIVATE_KEY");
  if (pem) {
    pem = pem.replace(/\\n/g, "\n");
  } else if (optional("OKTA_AGENT_PRIVATE_KEY_B64")) {
    pem = Buffer.from(optional("OKTA_AGENT_PRIVATE_KEY_B64"), "base64").toString("utf-8");
  } else if (optional("OKTA_AGENT_PRIVATE_KEY_PATH")) {
    pem = readFileSync(optional("OKTA_AGENT_PRIVATE_KEY_PATH"), "utf-8");
  } else {
    throw new Error(
      "AI Agentの秘密鍵が設定されていません (OKTA_AGENT_PRIVATE_KEY / OKTA_AGENT_PRIVATE_KEY_B64 / OKTA_AGENT_PRIVATE_KEY_PATH)",
    );
  }

  cachedKey = createPrivateKey(pem);
  return cachedKey;
}

export const agentKeyId = () => optional("OKTA_AGENT_KEY_ID");
export const appTimezone = () => optional("APP_TIMEZONE", "Asia/Tokyo");
export const graphTimezone = () => optional("MS_GRAPH_TIMEZONE", "UTC");
export const openaiModel = () => optional("OPENAI_MODEL", "gpt-4o-mini");
