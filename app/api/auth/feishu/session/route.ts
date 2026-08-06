import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedJudge } from "@/lib/feishu-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  if (!applicationId) {
    return NextResponse.json({ authenticated: false, authorized: false, message: "缺少工作坊 ID。" });
  }
  try {
    const authorization = await resolveAuthenticatedJudge(request, applicationId, true);
    return NextResponse.json({
      authenticated: authorization.authenticated,
      authorized: Boolean(authorization.judge),
      method: authorization.method,
      user: authorization.user,
      judge: authorization.judge,
      message: authorization.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "评委身份校验失败。";
    return NextResponse.json({ authenticated: false, authorized: false, message }, { status: 502 });
  }
}
