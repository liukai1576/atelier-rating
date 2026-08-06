import { NextRequest, NextResponse } from "next/server";
import { clearFeishuSession, clearJudgeLinkSession, safeReturnTo } from "@/lib/feishu-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = new URL(safeReturnTo(request.nextUrl.searchParams.get("returnTo")), request.nextUrl.origin);
  const response = NextResponse.redirect(target);
  clearFeishuSession(response);
  clearJudgeLinkSession(response);
  return response;
}
