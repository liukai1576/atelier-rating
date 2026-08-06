import { NextRequest, NextResponse } from "next/server";
import { asBoolean, asText, listRecords, resolveExactBitableConfig } from "@/lib/bitable";
import {
  createJudgeLinkToken,
  resolveJudgeForRecord,
  safeReturnTo,
  setJudgeLinkSession,
  verifyToken,
  type JudgeLinkGrant,
} from "@/lib/feishu-auth";

export const dynamic = "force-dynamic";

const ADMIN_KEY = process.env.ATELIER_CONFIG_ADMIN_KEY?.trim() || "";

function redirectWithStatus(request: NextRequest, returnTo: string, key: "authSuccess" | "authError", value: string) {
  const destination = new URL(safeReturnTo(returnTo), request.nextUrl.origin);
  destination.searchParams.set(key, value);
  return NextResponse.redirect(destination);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { applicationId?: string; adminKey?: string };
    if (!ADMIN_KEY || payload.adminKey !== ADMIN_KEY) {
      return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
    }
    const applicationId = payload.applicationId?.trim() || "";
    const config = await resolveExactBitableConfig(applicationId);
    if (!config?.judgesTableId) {
      return NextResponse.json({ message: "这个工作坊尚未配置评委表。" }, { status: 404 });
    }
    const records = await listRecords(config, config.judgesTableId);
    const active = records.filter((record) =>
      record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true),
    );
    const returnTo = `/?app=${encodeURIComponent(applicationId)}`;
    const judges = await Promise.all(active.map(async (record) => {
      const { token, expiresAt } = await createJudgeLinkToken(applicationId, record.record_id);
      const url = new URL("/api/auth/judge-link", request.nextUrl.origin);
      url.searchParams.set("token", token);
      url.searchParams.set("returnTo", returnTo);
      return {
        id: asText(record.fields["评委ID"], record.record_id),
        name: asText(record.fields["评委姓名"], asText(record.fields["飞书姓名"], "未命名评委")),
        seat: asText(record.fields["座位号"], "JUDGE"),
        url: url.toString(),
        expiresAt,
      };
    }));
    return NextResponse.json({ judges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成评委专属链接失败。";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const token = request.nextUrl.searchParams.get("token") || "";
  try {
    const grant = await verifyToken<JudgeLinkGrant>(token);
    if (!grant || grant.kind !== "judge-link") {
      return redirectWithStatus(request, returnTo, "authError", "评委专属链接无效或已经过期，请联系组织者重新获取。");
    }
    const authorization = await resolveJudgeForRecord(grant.applicationId, grant.judgeRecordId);
    if (!authorization.judge) {
      return redirectWithStatus(request, returnTo, "authError", authorization.message || "当前评委不在启用白名单中。");
    }
    const response = redirectWithStatus(request, returnTo, "authSuccess", authorization.judge.name);
    await setJudgeLinkSession(response, token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "评委专属链接登录失败。";
    return redirectWithStatus(request, returnTo, "authError", message);
  }
}
