import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { asBoolean, asText, listRecords, resolveExactBitableConfig } from "@/lib/bitable";

export const JUDGE_SESSION_COOKIE = "atelier_judge_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type AuthorizedJudge = {
  id: string;
  name: string;
  seat: string;
  recordId: string;
};

type JudgeSessionGrant = {
  kind: "judge-session";
  applicationId: string;
  judgeRecordId: string;
  accessToken: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.ATELIER_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("服务器尚未配置至少 32 字符的 ATELIER_SESSION_SECRET。");
  }
  return secret;
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

async function signToken(payload: Record<string, unknown>) {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getSigningKey(),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyToken<T extends { exp?: number }>(value?: string | null): Promise<T | null> {
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

function judgeFromRecord(record: { record_id: string; fields: Record<string, unknown> }): AuthorizedJudge {
  return {
    id: asText(record.fields["评委ID"], record.record_id),
    name: asText(record.fields["评委姓名"], "未命名评委"),
    seat: asText(record.fields["座位号"], "JUDGE"),
    recordId: record.record_id,
  };
}

export async function resolveJudgeByAccessToken(applicationId: string, accessToken: string) {
  const config = await resolveExactBitableConfig(applicationId);
  if (!config?.judgesTableId) return { judge: null, message: "这个工作坊尚未配置评委表。" };
  const records = await listRecords(config, config.judgesTableId);
  const record = records.find((item) =>
    asText(item.fields["访问令牌"]) === accessToken
    && (item.fields["启用"] === undefined || asBoolean(item.fields["启用"], true)),
  );
  if (!record) return { judge: null, message: "评委专属链接无效或该评委已停用。" };
  return { judge: judgeFromRecord(record) };
}

async function resolveJudgeFromGrant(grant: JudgeSessionGrant) {
  const config = await resolveExactBitableConfig(grant.applicationId);
  if (!config?.judgesTableId) return { judge: null, message: "这个工作坊尚未配置评委表。" };
  const records = await listRecords(config, config.judgesTableId);
  const record = records.find((item) =>
    item.record_id === grant.judgeRecordId
    && asText(item.fields["访问令牌"]) === grant.accessToken
    && (item.fields["启用"] === undefined || asBoolean(item.fields["启用"], true)),
  );
  if (!record) return { judge: null, message: "评委专属链接已更新、停用或失效，请联系组织者。" };
  return { judge: judgeFromRecord(record) };
}

export async function setJudgeSession(
  response: NextResponse,
  applicationId: string,
  judge: AuthorizedJudge,
  accessToken: string,
) {
  const grant: JudgeSessionGrant = {
    kind: "judge-session",
    applicationId,
    judgeRecordId: judge.recordId,
    accessToken,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  response.cookies.set(JUDGE_SESSION_COOKIE, await signToken(grant), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearJudgeSession(response: NextResponse) {
  response.cookies.set(JUDGE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function resolveAuthenticatedJudge(request: NextRequest, applicationId: string) {
  const grant = await verifyToken<JudgeSessionGrant>(request.cookies.get(JUDGE_SESSION_COOKIE)?.value);
  if (!grant || grant.kind !== "judge-session" || grant.applicationId !== applicationId) {
    return { authenticated: false, judge: null, message: "请使用管理员发送的评委专属链接进入评分台。" };
  }
  const authorization = await resolveJudgeFromGrant(grant);
  return {
    authenticated: Boolean(authorization.judge),
    judge: authorization.judge,
    message: authorization.message,
  };
}
