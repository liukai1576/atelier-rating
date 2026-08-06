import { NextRequest, NextResponse } from "next/server";
import {
  listRegisteredApplications,
  resolveExactBitableConfig,
  saveRegisteredApplication,
  saveCriteriaRecords,
  setRegisteredApplicationEnabled,
  setRegisteredApplicationName,
  validateBaseTemplate,
} from "@/lib/bitable";
import type { Criterion, ScoringTemplateId } from "@/lib/scoring";
import { cloneCriteria, SCORING_TEMPLATES, validateCriteria } from "@/lib/scoring";

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

function hasAdminAccess(request: NextRequest, suppliedKey?: string) {
  return Boolean(ADMIN_KEY)
    && (request.headers.get("x-atelier-admin-key") === ADMIN_KEY || suppliedKey === ADMIN_KEY);
}

export async function GET(request: NextRequest) {
  try {
    const applications = await listRegisteredApplications();
    const adminRequest = request.nextUrl.searchParams.get("admin") === "1";
    if (adminRequest) {
      if (!ADMIN_KEY) {
        return NextResponse.json({ message: "服务器尚未配置 ATELIER_CONFIG_ADMIN_KEY。" }, { status: 503 });
      }
      if (!hasAdminAccess(request)) {
        return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
      }
      return NextResponse.json({ applications, templateUrl: TEMPLATE_URL });
    }
    return NextResponse.json({
      applications: applications
        .filter((item) => item.enabled)
        .map(({ id, name, enabled, order }) => ({ id, name, enabled, order })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取工作坊配置失败";
    return NextResponse.json({ applications: [], templateUrl: TEMPLATE_URL, message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      action?: "authenticate" | "list";
      adminKey?: string;
      name?: string;
      baseUrl?: string;
      templateId?: ScoringTemplateId;
      criteria?: Criterion[];
    };
    if (!ADMIN_KEY) {
      return NextResponse.json({ saved: false, message: "服务器尚未配置 ATELIER_CONFIG_ADMIN_KEY。" }, { status: 503 });
    }
    if (!hasAdminAccess(request, payload.adminKey)) {
      return NextResponse.json({ saved: false, message: "管理密钥不正确。" }, { status: 401 });
    }
    if (payload.action === "authenticate") {
      return NextResponse.json({ authenticated: true });
    }
    if (payload.action === "list") {
      const applications = await listRegisteredApplications();
      return NextResponse.json({ authenticated: true, applications, templateUrl: TEMPLATE_URL });
    }
    const name = payload.name?.trim() || "";
    const baseUrl = payload.baseUrl?.trim() || "";
    if (!name || !baseUrl) {
      return NextResponse.json({ saved: false, message: "请填写工作坊名称和 Base 链接。" }, { status: 400 });
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
    const templateId = payload.templateId === "personal" ? "personal" : "team";
    const criteria = payload.criteria?.length
      ? payload.criteria
      : cloneCriteria(SCORING_TEMPLATES[templateId].criteria);
    const criteriaError = validateCriteria(criteria);
    if (criteriaError) {
      return NextResponse.json({ saved: false, message: criteriaError }, { status: 400 });
    }
    const savedApplication = await saveRegisteredApplication({
      id,
      name,
      baseUrl: validation.baseUrl,
      appToken: validation.appToken,
      tables: validation.tables,
    });
    const targetConfig = await resolveExactBitableConfig(savedApplication.id);
    if (!targetConfig) throw new Error("工作坊已注册，但无法回读评分标准配置。");
    await saveCriteriaRecords(targetConfig, criteria, templateId, "V1");
    const applications = await listRegisteredApplications();
    const application = applications.find((item) => item.id === id)
      ?? applications.find((item) => item.appToken === validation.appToken);
    return NextResponse.json({ saved: true, application, applications, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存工作坊配置失败";
    return NextResponse.json({ saved: false, message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json() as { id?: string; enabled?: boolean; name?: string; adminKey?: string };
    if (!ADMIN_KEY) {
      return NextResponse.json({ saved: false, message: "服务器尚未配置 ATELIER_CONFIG_ADMIN_KEY。" }, { status: 503 });
    }
    if (!hasAdminAccess(request, payload.adminKey)) {
      return NextResponse.json({ saved: false, message: "管理密钥不正确。" }, { status: 401 });
    }
    const nextName = payload.name?.trim();
    if (!payload.id || (typeof payload.enabled !== "boolean" && !nextName)) {
      return NextResponse.json({ saved: false, message: "缺少工作坊 ID 或需要更新的内容。" }, { status: 400 });
    }
    if (nextName) await setRegisteredApplicationName(payload.id, nextName);
    if (typeof payload.enabled === "boolean") await setRegisteredApplicationEnabled(payload.id, payload.enabled);
    const applications = await listRegisteredApplications();
    return NextResponse.json({ saved: true, applications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新工作坊配置失败";
    return NextResponse.json({ saved: false, message }, { status: 502 });
  }
}
