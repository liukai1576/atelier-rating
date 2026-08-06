import { NextRequest, NextResponse } from "next/server";
import {
  asText,
  batchUpdateRecords,
  createRecord,
  listRecords,
  resolveBitableConfig,
  updateRecord,
} from "@/lib/bitable";
import { SCORE_FIELD_BY_CRITERION_ID } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type ScorePayload = {
  workshop: { id: string; name: string };
  project: { id: string; name: string; team: string };
  judge: { id: string; name: string };
  scoreCard: {
    scores: Record<string, number>;
    nomination: boolean | null;
    note: string;
  };
  weightedTotal: number;
  scoringVersion: string;
};

export async function POST(request: NextRequest) {
  const config = await resolveBitableConfig(request.nextUrl.searchParams.get("appId"));
  if (!config) {
    return NextResponse.json({ saved: false, message: "尚未配置飞书多维表格。" }, { status: 503 });
  }

  try {
    const payload = await request.json() as ScorePayload;
    if (!payload.workshop?.id || !payload.project?.id || !payload.judge?.id) {
      return NextResponse.json({ saved: false, message: "缺少工作坊、项目或评委标识。" }, { status: 400 });
    }
    const uniqueKey = `${payload.workshop.id}::${payload.judge.id}::${payload.project.id}`;
    const fields: Record<string, unknown> = {
      "评分唯一键": uniqueKey,
      "工作坊ID": payload.workshop.id,
      "工作坊名称": payload.workshop.name,
      "项目ID": payload.project.id,
      "项目名称": payload.project.name,
      "项目组": payload.project.team,
      "评委ID": payload.judge.id,
      "评委姓名": payload.judge.name,
      "加权总分": payload.weightedTotal,
      "评分标准版本": payload.scoringVersion || "V1",
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

    const records = await listRecords(config, config.scoresTableId);
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
  const config = await resolveBitableConfig(request.nextUrl.searchParams.get("appId"));
  if (!config) {
    return NextResponse.json({ locked: false, message: "尚未配置飞书多维表格。" }, { status: 503 });
  }

  try {
    const payload = await request.json() as { workshopId: string; judgeId: string };
    const records = await listRecords(config, config.scoresTableId);
    const targets = records.filter((record) =>
      asText(record.fields["工作坊ID"]) === payload.workshopId
      && asText(record.fields["评委ID"]) === payload.judgeId,
    );
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
