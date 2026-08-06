import { NextRequest, NextResponse } from "next/server";
import { readFeishuIdentity, resolveJudgeForIdentity } from "@/lib/feishu-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const identity = await readFeishuIdentity(request);
  if (!identity) return NextResponse.json({ authenticated: false, authorized: false });
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  if (!applicationId) {
    return NextResponse.json({ authenticated: true, authorized: false, user: { name: identity.name }, message: "缺少工作坊 ID。" });
  }
  try {
    const authorization = await resolveJudgeForIdentity(applicationId, identity, true);
    return NextResponse.json({
      authenticated: true,
      authorized: Boolean(authorization.judge),
      user: { name: identity.name, avatarUrl: identity.avatarUrl },
      judge: authorization.judge,
      message: authorization.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "评委身份校验失败。";
    return NextResponse.json({ authenticated: true, authorized: false, user: { name: identity.name }, message }, { status: 502 });
  }
}
