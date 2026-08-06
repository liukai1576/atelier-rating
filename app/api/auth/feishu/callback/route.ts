import { NextRequest, NextResponse } from "next/server";
import {
  FEISHU_OAUTH_COOKIE,
  getFeishuOAuthCredentials,
  resolveJudgeForIdentity,
  safeReturnTo,
  setFeishuSession,
  verifyToken,
  type FeishuIdentity,
  type OAuthState,
} from "@/lib/feishu-auth";

export const dynamic = "force-dynamic";

type TokenEnvelope = {
  code?: number;
  msg?: string;
  access_token?: string;
  data?: { access_token?: string };
};

type UserInfoEnvelope = {
  code?: number;
  msg?: string;
  data?: {
    open_id?: string;
    union_id?: string;
    name?: string;
    avatar_url?: string;
  };
};

function redirectWithStatus(request: NextRequest, returnTo: string, key: string, value: string) {
  const target = new URL(safeReturnTo(returnTo), request.nextUrl.origin);
  target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const oauthState = await verifyToken<OAuthState>(request.cookies.get(FEISHU_OAUTH_COOKIE)?.value);
  const fallbackReturnTo = "/";
  if (!oauthState || request.nextUrl.searchParams.get("state") !== oauthState.nonce) {
    return redirectWithStatus(request, fallbackReturnTo, "authError", "飞书登录校验失败，请重新登录。");
  }
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  if (!code) return redirectWithStatus(request, oauthState.returnTo, "authError", "飞书没有返回登录授权码。");

  try {
    const { appId, appSecret } = getFeishuOAuthCredentials();
    const tokenResponse = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: oauthState.redirectUri,
      }),
    });
    const tokenPayload = await tokenResponse.json() as TokenEnvelope;
    const accessToken = tokenPayload.access_token ?? tokenPayload.data?.access_token;
    if (!tokenResponse.ok || tokenPayload.code !== 0 || !accessToken) {
      throw new Error(tokenPayload.msg || "飞书授权码交换失败。");
    }
    const userResponse = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userPayload = await userResponse.json() as UserInfoEnvelope;
    const user = userPayload.data;
    if (!userResponse.ok || userPayload.code !== 0 || !user?.open_id || !user.name) {
      throw new Error(userPayload.msg || "无法读取飞书用户信息。");
    }
    const identity: Omit<FeishuIdentity, "exp"> = {
      openId: user.open_id,
      unionId: user.union_id,
      name: user.name,
      avatarUrl: user.avatar_url,
    };
    const sessionIdentity: FeishuIdentity = { ...identity, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60 };
    const authorization = await resolveJudgeForIdentity(oauthState.applicationId, sessionIdentity, true);
    const response = authorization.judge
      ? redirectWithStatus(request, oauthState.returnTo, "authSuccess", authorization.judge.name)
      : redirectWithStatus(request, oauthState.returnTo, "authError", authorization.message || "当前飞书用户没有评分权限。");
    await setFeishuSession(response, identity);
    response.cookies.set(FEISHU_OAUTH_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "飞书登录失败。";
    return redirectWithStatus(request, oauthState.returnTo, "authError", message);
  }
}
