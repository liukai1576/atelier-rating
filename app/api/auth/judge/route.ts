import { NextRequest, NextResponse } from "next/server";
import { resolveJudgeByAccessToken, setJudgeSession } from "@/lib/judge-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  const accessToken = request.nextUrl.searchParams.get("token")?.trim() || "";
  const destination = new URL("/", request.nextUrl.origin);
  if (applicationId) destination.searchParams.set("app", applicationId);
  try {
    if (!applicationId || !accessToken) throw new Error("评委专属链接缺少必要信息。 ");
    const authorization = await resolveJudgeByAccessToken(applicationId, accessToken);
    if (!authorization.judge) throw new Error(authorization.message || "评委专属链接无效。");
    destination.searchParams.set("authSuccess", authorization.judge.name);
    const response = NextResponse.redirect(destination);
    await setJudgeSession(response, applicationId, authorization.judge, accessToken);
    return response;
  } catch (error) {
    destination.searchParams.set("authError", error instanceof Error ? error.message : "评委专属链接无效。");
    return NextResponse.redirect(destination);
  }
}
