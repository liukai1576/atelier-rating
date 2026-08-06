import { NextRequest, NextResponse } from "next/server";
import {
  criteriaFromRecords,
  listRecords,
  resolveExactBitableConfig,
  saveCriteriaRecords,
} from "@/lib/bitable";
import type { Criterion, ScoringTemplateId } from "@/lib/scoring";
import { SCORING_TEMPLATES, validateCriteria } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const ADMIN_KEY = process.env.ATELIER_CONFIG_ADMIN_KEY?.trim() || "";

function hasAdminAccess(request: NextRequest, suppliedKey?: string) {
  return Boolean(ADMIN_KEY)
    && (request.headers.get("x-atelier-admin-key") === ADMIN_KEY || suppliedKey === ADMIN_KEY);
}

export async function GET(request: NextRequest) {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ message: "管理密钥不正确。" }, { status: 401 });
    }
    const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
    const config = await resolveExactBitableConfig(applicationId);
    if (!config?.rubricsTableId) {
      return NextResponse.json({ message: "这个工作坊尚未配置评分标准表。" }, { status: 422 });
    }
    const [rubricRecords, scoreRecords] = await Promise.all([
      listRecords(config, config.rubricsTableId),
      listRecords(config, config.scoresTableId),
    ]);
    return NextResponse.json({
      ...criteriaFromRecords(rubricRecords),
      locked: scoreRecords.length > 0,
      scoreCount: scoreRecords.length,
      templates: SCORING_TEMPLATES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取评分标准失败";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json() as {
      adminKey?: string;
      applicationId?: string;
      templateId?: ScoringTemplateId;
      criteria?: Criterion[];
    };
    if (!hasAdminAccess(request, payload.adminKey)) {
      return NextResponse.json({ saved: false, message: "管理密钥不正确。" }, { status: 401 });
    }
    const applicationId = payload.applicationId?.trim() || "";
    const config = await resolveExactBitableConfig(applicationId);
    if (!config?.rubricsTableId) {
      return NextResponse.json({ saved: false, message: "这个工作坊尚未配置评分标准表。" }, { status: 422 });
    }
    const templateId = payload.templateId === "personal" ? "personal" : "team";
    const criteria = payload.criteria ?? [];
    const validationError = validateCriteria(criteria);
    if (validationError) {
      return NextResponse.json({ saved: false, message: validationError }, { status: 400 });
    }
    const scoreRecords = await listRecords(config, config.scoresTableId);
    if (scoreRecords.length) {
      return NextResponse.json({
        saved: false,
        locked: true,
        message: `已经产生 ${scoreRecords.length} 份评分，评分标准已锁定。请新建工作坊后再调整。`,
      }, { status: 409 });
    }
    const result = await saveCriteriaRecords(config, criteria, templateId, "V1");
    return NextResponse.json({ saved: true, ...result, locked: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存评分标准失败";
    return NextResponse.json({ saved: false, message }, { status: 502 });
  }
}
