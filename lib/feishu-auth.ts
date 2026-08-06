import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import {
  asBoolean,
  asText,
  listRecords,
  resolveExactBitableConfig,
  updateRecord,
} from "@/lib/bitable";

export const FEISHU_SESSION_COOKIE = "atelier_feishu_session";
export const FEISHU_OAUTH_COOKIE = "atelier_feishu_oauth";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const OAUTH_MAX_AGE_SECONDS = 10 * 60;

export type FeishuIdentity = {
  openId: string;
  unionId?: string;
  name: string;
  avatarUrl?: string;
  exp: number;
};

export type AuthorizedJudge = {
  id: string;
  name: string;
  seat: string;
  recordId: string;
};

export type OAuthState = {
  nonce: string;
  applicationId: string;
  returnTo: string;
  redirectUri: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.ATELIER_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("服务器尚未配置至少 32 字符的 ATELIER_SESSION_SECRET。");
  }
  return secret;
}

export function getFeishuOAuthCredentials() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("服务器尚未配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。");
  }
  return { appId, appSecret };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: Record<string, unknown>) {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getSigningKey(),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends { exp?: number }>(value?: string | null): Promise<T | null> {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getSigningKey(),
      base64UrlToBytes(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as T;
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function safeReturnTo(value?: string | null) {
  const candidate = value?.trim() || "/";
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
}

export function getOAuthRedirectUri(request: NextRequest) {
  return process.env.FEISHU_OAUTH_REDIRECT_URI?.trim()
    || `${request.nextUrl.origin}/api/auth/feishu/callback`;
}

export async function createOAuthState(request: NextRequest, applicationId: string, returnTo: string) {
  const state: OAuthState = {
    nonce: crypto.randomUUID(),
    applicationId,
    returnTo: safeReturnTo(returnTo),
    redirectUri: getOAuthRedirectUri(request),
    exp: Math.floor(Date.now() / 1000) + OAUTH_MAX_AGE_SECONDS,
  };
  return { state, token: await signToken(state) };
}

export async function readFeishuIdentity(request: NextRequest) {
  return verifyToken<FeishuIdentity>(request.cookies.get(FEISHU_SESSION_COOKIE)?.value);
}

export async function setFeishuSession(response: NextResponse, identity: Omit<FeishuIdentity, "exp">) {
  const payload: FeishuIdentity = {
    ...identity,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  response.cookies.set(FEISHU_SESSION_COOKIE, await signToken(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearFeishuSession(response: NextResponse) {
  response.cookies.set(FEISHU_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

export async function resolveJudgeForIdentity(
  applicationId: string,
  identity: FeishuIdentity,
  allowNameBinding: boolean,
): Promise<{ judge: AuthorizedJudge | null; message?: string }> {
  const config = await resolveExactBitableConfig(applicationId);
  if (!config?.judgesTableId) return { judge: null, message: "这个工作坊尚未配置评委表。" };
  const records = await listRecords(config, config.judgesTableId);
  const active = records.filter((record) =>
    record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true),
  );
  let matched = active.find((record) => asText(record.fields["飞书OpenID"]) === identity.openId);

  if (!matched && allowNameBinding) {
    const normalizedIdentityName = normalizeName(identity.name);
    const candidates = active.filter((record) =>
      !asText(record.fields["飞书OpenID"])
      && normalizeName(asText(record.fields["评委姓名"])) === normalizedIdentityName,
    );
    if (candidates.length > 1) {
      return { judge: null, message: "评委白名单中存在重名，请管理员先为对应记录填写飞书 OpenID。" };
    }
    if (candidates.length === 1) {
      matched = candidates[0];
      await updateRecord(config, config.judgesTableId, matched.record_id, {
        "飞书OpenID": identity.openId,
        "飞书姓名": identity.name,
      });
    }
  }

  if (!matched) {
    return { judge: null, message: `飞书用户「${identity.name}」不在当前工作坊的评委白名单中。` };
  }

  if (asText(matched.fields["飞书姓名"]) !== identity.name) {
    await updateRecord(config, config.judgesTableId, matched.record_id, { "飞书姓名": identity.name });
  }

  return {
    judge: {
      id: asText(matched.fields["评委ID"], matched.record_id),
      name: identity.name,
      seat: asText(matched.fields["座位号"], "JUDGE"),
      recordId: matched.record_id,
    },
  };
}
