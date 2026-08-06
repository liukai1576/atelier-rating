import { NextRequest, NextResponse } from "next/server";
import {
  createOAuthState,
  FEISHU_OAUTH_COOKIE,
  getFeishuOAuthCredentials,
  safeReturnTo,
} from "@/lib/feishu-auth";
import { resolveExactBitableConfig } from "@/lib/bitable";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
    if (!applicationId || !(await resolveExactBitableConfig(applicationId))) {
      return NextResponse.json({ message: "工作坊链接无效或尚未配置。" }, { status: 404 });
    }
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const { appId } = getFeishuOAuthCredentials();
    const { state, token } = await createOAuthState(request, applicationId, returnTo);
    const authorizeUrl = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("redirect_uri", state.redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state.nonce);
    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(FEISHU_OAUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法发起飞书登录。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
