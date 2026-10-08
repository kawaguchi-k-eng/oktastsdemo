/**
 * Okta AI Agent の Resource Connections (Applicationタイプ / Resource server connector)
 * を使って、Office 365 (Microsoft Graph) のアクセストークンをOkta経由でブローカー取得する。
 *
 * 処理の流れ (User access構成):
 *   1. ユーザーがOktaにログインし、ID Tokenを取得する(oidc.ts側で実施)
 *   2. AI Agent自身の秘密鍵でclient_assertion(JWT)を作成する
 *   3. Org Authorization Serverの /oauth2/v1/token に対して
 *      grant_type=urn:ietf:params:oauth:grant-type:token-exchange を投げ、
 *      requested_token_type=urn:okta:params:oauth:token-type:oauth-sts を要求する
 *      - 未認可: HTTP 400 + error=interaction_required + interaction_uri
 *      - 認可済み: HTTP 200 + Okta がMicrosoftからブローカー取得したaccess_token
 *        (refresh/再取得はOkta側が保持・処理するため、アプリ側で保管する必要はない)
 */

import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { agentKeyId, agentPrivateKey, required } from "./config";

export class InteractionRequired extends Error {
  constructor(public interactionUri: string) {
    super(`interaction required: ${interactionUri}`);
  }
}

const orgTokenUrl = () => `https://${required("OKTA_DOMAIN")}/oauth2/v1/token`;

async function buildClientAssertion(): Promise<string> {
  const agentClientId = required("OKTA_AGENT_CLIENT_ID");
  const kid = agentKeyId();
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", ...(kid ? { kid } : {}) })
    .setIssuer(agentClientId)
    .setSubject(agentClientId)
    .setAudience(orgTokenUrl())
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(agentPrivateKey());
}

/**
 * ID Tokenをsubject_tokenとしてOffice 365のアクセストークンを取得する。
 * 未認可の場合は InteractionRequired を投げる。
 */
export async function getResourceAccessToken(
  idToken: string,
  resourceIndicator = required("OKTA_OFFICE365_RESOURCE_INDICATOR"),
): Promise<string> {
  const res = await fetch(orgTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:okta:params:oauth:token-type:oauth-sts",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: await buildClientAssertion(),
      resource: resourceIndicator,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (res.status === 400) {
    try {
      const body = JSON.parse(text);
      if (body.error === "interaction_required") throw new InteractionRequired(body.interaction_uri);
    } catch (e) {
      if (e instanceof InteractionRequired) throw e;
    }
  }
  if (!res.ok) {
    // Oktaが返すエラー本文(error / error_description)を握りつぶさず表示する
    throw new Error(`token-exchange failed: HTTP ${res.status} ${text}`);
  }
  return JSON.parse(text).access_token as string;
}
