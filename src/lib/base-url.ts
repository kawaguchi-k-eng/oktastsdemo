import type { NextRequest } from "next/server";
import { optional } from "./config";

/**
 * アプリの公開URL。Flask の url_for(..., _external=True) に相当。
 * Amplify では CloudFront 経由になるため、APP_BASE_URL を明示するのが確実。
 */
export function baseUrl(req: NextRequest): string {
  const configured = optional("APP_BASE_URL");
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const callbackUrl = (req: NextRequest) => `${baseUrl(req)}/authorization-code/callback`;
