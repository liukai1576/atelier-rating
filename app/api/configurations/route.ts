import { NextRequest, NextResponse } from "next/server";
import {
  listRegisteredApplications,
  saveRegisteredApplication,
  validateBaseTemplate,
} from "@/lib/bitable";

export const dynamic = "force-dynamic";

const TEMPLATE_URL = process.env.FEISHU_TEMPLATE_BASE_URL?.trim()
  || "https://rollingdigital.feishu.cn/base/Pvq3bHtkLapPMVs2f2XcC7b2nTd";
const ADMIN_KEY = process.env.ATELIER_CONFIG_ADMIN_KEY?.trim() || "";

function makeId(name: string, appToken: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${slug || "rating"}-${appToken.slice(-6).toLowerCase()}`;
}

export async function GET() {
  try {
    const applications = await listRegisteredApplications();
    return NextResponse.json({ applications, templateUrl: TEMPLATE_URL, adminKeyRequired: Boolean(ADMIN_KEY) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取评分项目配置失败";
    return NextResponse.json({ applications: [], templateUrl: TEMPLATE_URL, message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (ADMIN_KEY && request.headers.get("x-atelier-admin-key") !== ADMIN_KEY) {
      return NextResponse.json({ saved: false, message: "管理密钥不正确。" }, { status: 401 });
    }
    const payload = await request.json() as { name?: string; baseUrl?: string };
    const name = payload.name?.trim() || "";
    const baseUrl = payload.baseUrl?.trim() || "";
    if (!name || !baseUrl) {
      return NextResponse.json({ saved: false, message: "请填写评分项目名称和 Base 链接。" }, { status: 400 });
    }
    const validation = await validateBaseTemplate(baseUrl);
    if (!validation.valid || !validation.tables || !validation.baseUrl) {
      const problems = [
        validation.missingTables?.length ? `缺少数据表：${validation.missingTables.join("、")}` : "",
        ...Object.entries(validation.missingFields ?? {}).map(([table, fields]) =>
          `${table}表缺少字段：${fields.join("、")}`,
        ),
      ].filter(Boolean);
      return NextResponse.json({ saved: false, validation, message: problems.join("；") || "表格不符合评分模板。" }, { status: 422 });
    }
    const id = makeId(name, validation.appToken);
    await saveRegisteredApplication({
      id,
      name,
      baseUrl: validation.baseUrl,
      appToken: validation.appToken,
      tables: validation.tables,
    });
    const applications = await listRegisteredApplications();
    const application = applications.find((item) => item.id === id)
      ?? applications.find((item) => item.appToken === validation.appToken);
    return NextResponse.json({ saved: true, application, applications, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存评分项目配置失败";
    return NextResponse.json({ saved: false, message }, { status: 502 });
  }
}
