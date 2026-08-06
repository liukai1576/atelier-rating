import { NextRequest, NextResponse } from "next/server";
import {
  asBoolean,
  asText,
  createRecord,
  listRecords,
  resolveExactBitableConfig,
  updateRecord,
} from "@/lib/bitable";

export const dynamic = "force-dynamic";

const ADMIN_KEY = process.env.ATELIER_CONFIG_ADMIN_KEY?.trim() || "";

function hasAdminAccess(request: NextRequest, suppliedKey?: string) {
  return Boolean(ADMIN_KEY)
    && (request.headers.get("x-atelier-admin-key") === ADMIN_KEY || suppliedKey === ADMIN_KEY);
}

function publicOrigin(request: NextRequest) {
  const configured = process.env.ATELIER_PUBLIC_SITE_URL?.trim();
  if (!configured) return request.nextUrl.origin;
  const url = new URL(configured);
  if (!/^https?:$/.test(url.protocol)) throw new Error("ATELIER_PUBLIC_SITE_URL 必须是 HTTP 或 HTTPS 地址。");
  return url.origin;
}

function createAccessToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function createJudgeId() {
  return `judge-${crypto.randomUUID().slice(0, 8)}`;
}

function judgeUrl(origin: string, applicationId: string, accessToken: string) {
  const url = new URL("/api/auth/judge", origin);
  url.searchParams.set("appId", applicationId);
  url.searchParams.set("token", accessToken);
  return url.toString();
}

function judgeLinkCell(url: string) {
  return { text: url, link: url };
}

async function loadJudges(request: NextRequest, applicationId: string, backfill: boolean) {
  const config = await resolveExactBitableConfig(applicationId);
  if (!config?.judgesTableId) throw new Error("这个工作坊尚未配置评委表。");
  const records = await listRecords(config, config.judgesTableId);
  const origin = publicOrigin(request);
  const judges = await Promise.all(records.map(async (record) => {
    const accessToken = asText(record.fields["访问令牌"]) || createAccessToken();
    const id = asText(record.fields["评委ID"]) || createJudgeId();
    const link = judgeUrl(origin, applicationId, accessToken);
    if (backfill && (
      !asText(record.fields["访问令牌"])
      || !asText(record.fields["评委ID"])
      || asText(record.fields["评委专属链接"]) !== link
    )) {
      await updateRecord(config, config.judgesTableId!, record.record_id, {
        "评委ID": id,
        "访问令牌": accessToken,
        "评委专属链接": judgeLinkCell(link),
      });
    }
    return {
      recordId: record.record_id,
      id,
      name: asText(record.fields["评委姓名"], "未命名评委"),
      seat: asText(record.fields["座位号"], ""),
      enabled: record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true),
      url: link,
    };
  }));
  return { config, judges };
}

export async function GET(request: NextRequest) {
  try {
    if (!hasAdminAccess(request)) return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
    const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
    if (!applicationId) return NextResponse.json({ message: "缺少工作坊 ID。" }, { status: 400 });
    const { judges } = await loadJudges(request, applicationId, true);
    return NextResponse.json({ judges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取评委失败。";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { applicationId?: string; name?: string; seat?: string; adminKey?: string };
    if (!hasAdminAccess(request, payload.adminKey)) return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
    const applicationId = payload.applicationId?.trim() || "";
    const name = payload.name?.trim() || "";
    if (!applicationId || !name) return NextResponse.json({ message: "请填写评委姓名。" }, { status: 400 });
    const config = await resolveExactBitableConfig(applicationId);
    if (!config?.judgesTableId) return NextResponse.json({ message: "这个工作坊尚未配置评委表。" }, { status: 404 });
    const accessToken = createAccessToken();
    await createRecord(config, config.judgesTableId, {
      "评委姓名": name,
      "评委ID": createJudgeId(),
      "座位号": payload.seat?.trim() || "",
      "访问令牌": accessToken,
      "评委专属链接": judgeLinkCell(judgeUrl(publicOrigin(request), applicationId, accessToken)),
      "启用": true,
    });
    const { judges } = await loadJudges(request, applicationId, false);
    return NextResponse.json({ saved: true, judges });
  } catch (error) {
    console.error("[configurations judges POST]", error);
    const message = error instanceof Error ? error.message : "新增评委失败。";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json() as {
      applicationId?: string;
      recordId?: string;
      name?: string;
      seat?: string;
      enabled?: boolean;
      rotate?: boolean;
      adminKey?: string;
    };
    if (!hasAdminAccess(request, payload.adminKey)) return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
    const applicationId = payload.applicationId?.trim() || "";
    const recordId = payload.recordId?.trim() || "";
    if (!applicationId || !recordId) return NextResponse.json({ message: "缺少工作坊或评委记录 ID。" }, { status: 400 });
    const config = await resolveExactBitableConfig(applicationId);
    if (!config?.judgesTableId) return NextResponse.json({ message: "这个工作坊尚未配置评委表。" }, { status: 404 });
    const records = await listRecords(config, config.judgesTableId);
    const current = records.find((record) => record.record_id === recordId);
    if (!current) return NextResponse.json({ message: "评委记录不存在。" }, { status: 404 });
    const fields: Record<string, unknown> = {};
    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) return NextResponse.json({ message: "评委姓名不能为空。" }, { status: 400 });
      fields["评委姓名"] = name;
    }
    if (payload.seat !== undefined) fields["座位号"] = payload.seat.trim();
    if (payload.enabled !== undefined) fields["启用"] = payload.enabled;
    if (payload.rotate || !asText(current.fields["访问令牌"])) {
      const accessToken = createAccessToken();
      fields["访问令牌"] = accessToken;
      fields["评委专属链接"] = judgeLinkCell(judgeUrl(publicOrigin(request), applicationId, accessToken));
    }
    await updateRecord(config, config.judgesTableId, recordId, fields);
    const { judges } = await loadJudges(request, applicationId, true);
    return NextResponse.json({ saved: true, judges });
  } catch (error) {
    console.error("[configurations judges PATCH]", error);
    const message = error instanceof Error ? error.message : "更新评委失败。";
    return NextResponse.json({ message }, { status: 502 });
  }
}
