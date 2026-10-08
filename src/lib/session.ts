/**
 * Flask の session に相当する、暗号化Cookieベースのセッション。
 *
 * Amplify Hosting の SSR はリクエストごとに別のLambdaで動く可能性があるため、
 * サーバーのメモリにセッションを持たず、JWE (A256GCM) で暗号化したCookieに保存する。
 * Cookieの上限(約4KB)に収めるため、ここには ID Token とユーザー表示情報だけを置き、
 * チャット履歴はブラウザ側で保持して /chat に毎回送る。
 */

import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { required } from "./config";

export const SESSION_COOKIE = "app_session";
export const LOGIN_TX_COOKIE = "login_tx";

export type SessionUser = { name?: string; email?: string; sub?: string };
export type SessionData = { idToken: string; user: SessionUser };
export type LoginTx = { state: string; nonce: string; codeVerifier: string };

function secretKey(): Uint8Array {
  const secret = required("SESSION_SECRET");
  return new Uint8Array(createHash("sha256").update(secret).digest());
}

export async function seal(data: JWTPayload, maxAgeSec: number): Promise<string> {
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .encrypt(secretKey());
}

export async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, secretKey());
    return payload as T;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const data = await unseal<SessionData>(store.get(SESSION_COOKIE)?.value);
  return data?.idToken ? data : null;
}
