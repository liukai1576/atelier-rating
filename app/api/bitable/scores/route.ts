import { NextRequest, NextResponse } from "next/server";
import {
  asBoolean,
  asText,
  batchUpdateRecords,
  createRecord,
  criteriaFromRecords,
  listRecords,
  resolveBitableConfig,
  updateRecord,
} from "@/lib/bitable";
import { resolveAuthenticatedJudge } from "@/lib/judge-auth";
import { SCORE_FIELD_BY_CRITERION_ID } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type ScorePayload = {
  workshop: { id: string };
  project: { id: string };
  scoreCard: {
    scores: Record<string, number>;
    nomination: boolean | null;
    note: string;
  };
};

export async function POST(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  const config = await resolveBitableConfig(applicationId);
  if (!config) {
    return NextResponse.json({ saved: false, message: "尚未配置飞书多维表格。" }, { status: 503 });
  }

  try {
    const authorization = await resolveAuthenticatedJudge(request, applicationId);
    if (!authorization.authenticated) {
      return NextResponse.json({ saved: false, message: "请使用管理员发送的评委专属链接进入后再提交评分。" }, { status: 401 });
    }
    if (!authorization.judge) {
      return NextResponse.json({ saved: false, message: authorization.message || "当前飞书用户没有评分权限。" }, { status: 403 });
    }
    const judge = authorization.judge;
    const payload = await request.json() as ScorePayload;
    if (!payload.workshop?.id || !payload.project?.id) {
      return NextResponse.json({ saved: false, message: "缺少工作坊或项目标识。" }, { status: 400 });
    }
    if (!config.workshopsTableId || !config.rubricsTableId) {
      return NextResponse.json({ saved: false, message: "工作坊或评分标准表尚未配置。" }, { status: 503 });
    }
    const [workshopRecords, projectRecords, rubricRecords, teamRecords, records] = await Promise.all([
      listRecords(config, config.workshopsTableId),
      listRecords(config, config.projectsTableId),
      listRecords(config, config.rubricsTableId),
      config.teamsTableId ? listRecords(config, config.teamsTableId) : Promise.resolve([]),
      listRecords(config, config.scoresTableId),
    ]);
    const workshopFields = workshopRecords[0]?.fields;
    const serverWorkshopId = workshopFields
      ? asText(workshopFields["工作坊ID"], config.id || "default-workshop")
      : "";
    const projectRecord = projectRecords.find((record) =>
      asText(record.fields["项目ID"], record.record_id) === payload.project.id
      && (record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true)),
    );
    if (!workshopFields || serverWorkshopId !== payload.workshop.id || !projectRecord) {
      return NextResponse.json({ saved: false, message: "工作坊或项目不属于当前评分链接。" }, { status: 400 });
    }
    const scoring = criteriaFromRecords(rubricRecords);
    const scoreValues = scoring.criteria.map((criterion) => payload.scoreCard.scores[criterion.id]);
    if (scoreValues.some((score) => typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10)) {
      return NextResponse.json({ saved: false, message: "六个评分维度都必须是 0–10 的有效数字。" }, { status: 400 });
    }
    const weightedTotal = scoring.criteria.reduce(
      (sum, criterion) => sum + payload.scoreCard.scores[criterion.id] * criterion.weight / 100,
      0,
    );
    const nominationLimit = Math.max(1, Number(workshopFields["提名上限"]) || 2);
    const otherNominations = new Set(records
      .filter((record) =>
        asText(record.fields["工作坊ID"]) === serverWorkshopId
        && asText(record.fields["评委ID"]) === judge.id
        && asBoolean(record.fields["提名"])
        && asText(record.fields["项目ID"]) !== payload.project.id,
      )
      .map((record) => asText(record.fields["项目ID"])))
      .size;
    if (payload.scoreCard.nomination === true && otherNominations >= nominationLimit) {
      return NextResponse.json({ saved: false, message: `每位评委最多提名 ${nominationLimit} 个项目。` }, { status: 400 });
    }
    const projectFields = projectRecord.fields;
    const teamId = asText(projectFields["项目组ID"]);
    const teamName = asText(
      teamRecords.find((record) => asText(record.fields["项目组ID"], record.record_id) === teamId)?.fields["项目组名称"],
      "未匹配项目组",
    );
    const uniqueKey = `${payload.workshop.id}::${judge.id}::${payload.project.id}`;
    const fields: Record<string, unknown> = {
      "评分唯一键": uniqueKey,
      "工作坊ID": serverWorkshopId,
      "工作坊名称": asText(workshopFields["工作坊名称"], config.name || "工作坊评分"),
      "项目ID": asText(projectFields["项目ID"], projectRecord.record_id),
      "项目名称": asText(projectFields["项目名称"], "未命名项目"),
      "项目组": teamName,
      "评委ID": judge.id,
      "评委姓名": judge.name,
      "加权总分": weightedTotal,
      "评分标准版本": scoring.version,
      "提名": payload.scoreCard.nomination === true,
      "评审笔记": payload.scoreCard.note ?? "",
      "提交时间": new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
      "已锁票": false,
    };
    Object.entries(SCORE_FIELD_BY_CRITERION_ID).forEach(([key, fieldName]) => {
      const value = payload.scoreCard.scores[key];
      if (typeof value === "number" && Number.isFinite(value)) fields[fieldName] = value;
    });

    const existing = records.find((record) => asText(record.fields["评分唯一键"]) === uniqueKey);
    const data = existing
      ? await updateRecord(config, config.scoresTableId, existing.record_id, fields)
      : await createRecord(config, config.scoresTableId, fields);
    const recordId = data.record.record_id;

    return NextResponse.json({
      saved: true,
      recordId,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bitable scores POST]", error);
    const message = error instanceof Error ? error.message : "写入多维表格失败";
    return NextResponse.json({ saved: false, message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const applicationId = request.nextUrl.searchParams.get("appId")?.trim() || "";
  const config = await resolveBitableConfig(applicationId);
  if (!config) {
    return NextResponse.json({ locked: false, message: "尚未配置飞书多维表格。" }, { status: 503 });
  }

  try {
    const authorization = await resolveAuthenticatedJudge(request, applicationId);
    if (!authorization.authenticated) {
      return NextResponse.json({ locked: false, message: "请使用管理员发送的评委专属链接进入后再锁票。" }, { status: 401 });
    }
    if (!authorization.judge) {
      return NextResponse.json({ locked: false, message: authorization.message || "当前飞书用户没有评分权限。" }, { status: 403 });
    }
    const payload = await request.json() as { workshopId: string };
    const [records, projectRecords] = await Promise.all([
      listRecords(config, config.scoresTableId),
      listRecords(config, config.projectsTableId),
    ]);
    const targets = records.filter((record) =>
      asText(record.fields["工作坊ID"]) === payload.workshopId
      && asText(record.fields["评委ID"]) === authorization.judge?.id,
    );
    const enabledProjectIds = new Set(projectRecords
      .filter((record) => record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true))
      .map((record) => asText(record.fields["项目ID"], record.record_id)));
    const scoredProjectIds = new Set(targets.map((record) => asText(record.fields["项目ID"])));
    if (!enabledProjectIds.size || [...enabledProjectIds].some((projectId) => !scoredProjectIds.has(projectId))) {
      return NextResponse.json({ locked: false, message: "全部启用项目都保存评分后才能锁票。" }, { status: 400 });
    }
    await batchUpdateRecords(
      config,
      config.scoresTableId,
      targets.map((record) => record.record_id),
      { "已锁票": true },
    );
    return NextResponse.json({ locked: true, count: targets.length });
  } catch (error) {
    console.error("[bitable scores PATCH]", error);
    const message = error instanceof Error ? error.message : "锁票写入失败";
    return NextResponse.json({ locked: false, message }, { status: 502 });
  }
}
