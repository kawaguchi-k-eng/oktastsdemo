/**
 * Okta へのユーザーログイン (Authorization Code + PKCE)。
 * Python版の Authlib (oauth.okta.authorize_redirect / authorize_access_token) に相当する。
 *
 * このデモのテナントでは「ログイン用OIDCアプリ」と「AI Agentクライアント」が
 * 同一アプリ(client_id共通)で、クライアント認証方式は private_key_jwt。
 * そのため、認可コード→トークン交換にも AI Agent と同じ秘密鍵で署名した
 * client_assertion を使う。OKTA_WEB_LOGIN_CLIENT_SECRET が設定されていれば
 * client_secret_post 方式で認証する。
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { agentKeyId, agentPrivateKey, optional, required } from "./config";
import type { LoginTx, SessionUser } from "./session";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri: string;
};

let discoveryCache: Discovery | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export const issuer = () => required("OKTA_ISSUER").replace(/\/$/, "");
const clientId = () => required("OKTA_WEB_LOGIN_CLIENT_ID");

export async function discovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const url = `${issuer()}/.well-known/openid-configuration`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status} (${url}) - OKTA_ISSUER を確認してください`);
  discoveryCache = (await res.json()) as Discovery;
  return discoveryCache;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function newLoginTx(): LoginTx {
  return {
    state: b64url(randomBytes(16)),
    nonce: b64url(randomBytes(16)),
    codeVerifier: b64url(randomBytes(32)),
  };
}

export async function authorizeUrl(tx: LoginTx, redirectUri: string): Promise<string> {
  const d = await discovery();
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: redirectUri,
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: b64url(createHash("sha256").update(tx.codeVerifier).digest()),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function clientAuthParams(tokenEndpoint: string): Promise<Record<string, string>> {
  const secret = optional("OKTA_WEB_LOGIN_CLIENT_SECRET");
  if (secret) return { client_id: clientId(), client_secret: secret };

  const kid = agentKeyId();
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", ...(kid ? { kid } : {}) })
    .setIssuer(clientId())
    .setSubject(clientId())
    .setAudience(tokenEndpoint)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(agentPrivateKey());
  return {
    client_id: clientId(),
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
  };
}

/** 認可コードをトークンに交換し、ID Tokenを検証して返す */
export async function exchangeCode(
  code: string,
  tx: LoginTx,
  redirectUri: string,
): Promise<{ idToken: string; user: SessionUser }> {
  const d = await discovery();
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: tx.codeVerifier,
      ...(await clientAuthParams(d.token_endpoint)),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`token request failed: HTTP ${res.status} ${await res.text()}`);
  }
  const token = (await res.json()) as { id_token: string; access_token?: string };

  jwks ??= createRemoteJWKSet(new URL(d.jwks_uri));
  const { payload } = await jwtVerify(token.id_token, jwks, {
    issuer: d.issuer,
    audience: clientId(),
  });
  if (payload.nonce !== tx.nonce) throw new Error("ID Token の nonce が一致しません");

  return { idToken: token.id_token, user: await loadUser(payload, d, token.access_token) };
}

/** 表示用ユーザー情報。ID Tokenに無ければ userinfo エンドポイントで補う */
async function loadUser(claims: JWTPayload, d: Discovery, accessToken?: string): Promise<SessionUser> {
  const user: SessionUser = {
    sub: claims.sub,
    name: claims.name as string | undefined,
    email: claims.email as string | undefined,
  };
  if ((user.name && user.email) || !accessToken || !d.userinfo_endpoint) return user;
  try {
    const res = await fetch(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.ok) {
      const info = (await res.json()) as SessionUser;
      user.name ??= info.name;
      user.email ??= info.email;
    }
  } catch {
    // 表示用なので失敗しても続行する
  }
  return user;
}

export function logoutUrl(idToken: string, postLogoutRedirectUri: string): string {
  const url = new URL(`${issuer()}/v1/logout`);
  url.search = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri,
  }).toString();
  return url.toString();
}
