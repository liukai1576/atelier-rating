import { NextRequest, NextResponse } from "next/server";
import { clearJudgeSession } from "@/lib/judge-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  const destination = new URL("/", request.nextUrl.origin);
  if (applicationId) destination.searchParams.set("app", applicationId);
  const response = NextResponse.redirect(destination);
  clearJudgeSession(response);
  return response;
}
