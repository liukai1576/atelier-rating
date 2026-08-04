import { NextRequest, NextResponse } from "next/server";
import {
  asBoolean,
  asDate,
  asNumber,
  asText,
  asUrl,
  listRecords,
  resolveBitableConfig,
} from "@/lib/bitable";

export const dynamic = "force-dynamic";

const scoreFields: Record<string, string> = {
  problem: "问题定义",
  value: "用户与业务价值",
  innovation: "方案创新性",
  feasibility: "可行性与完成度",
  impact: "影响力与可推广性",
  presentation: "表达与答辩",
};

function projectBackground(value: unknown, recordId: string, applicationId?: string) {
  if (typeof value === "string") return asUrl(value);
  if (!Array.isArray(value) || !value.length) return "";
  const first = value[0];
  if (!first || typeof first !== "object") return "";
  const attachment = first as Record<string, unknown>;
  const directUrl = asUrl(attachment.url ?? attachment.tmp_url);
  if (directUrl) return directUrl;
  const fileToken = asText(attachment.file_token);
  if (!fileToken) return "";
  const params = new URLSearchParams({ recordId, fileToken });
  if (applicationId) params.set("appId", applicationId);
  return `/api/bitable/project-image?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const config = await resolveBitableConfig(request.nextUrl.searchParams.get("appId"));
  if (!config) {
    return NextResponse.json({
      connected: false,
      message: "尚未配置飞书多维表格，当前使用本地演示数据。",
    });
  }

  try {
    const [projectRecords, scoreRecords, judgeRecords, teamRecords] = await Promise.all([
      listRecords(config, config.projectsTableId),
      listRecords(config, config.scoresTableId),
      config.judgesTableId ? listRecords(config, config.judgesTableId) : Promise.resolve([]),
      config.teamsTableId ? listRecords(config, config.teamsTableId) : Promise.resolve([]),
    ]);
    const teams = new Map(
      teamRecords
        .filter((record) => record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true))
        .map((record) => {
          const fields = record.fields;
          return [
            asText(fields["项目组ID"], record.record_id),
            {
              name: asText(fields["项目组名称"], "未命名项目组"),
              owner: asText(fields["负责人"]),
              members: asText(fields["成员"]),
              description: asText(fields["项目组简介"]),
              materialsUrl: asUrl(fields["资料链接"]),
            },
          ] as const;
        }),
    );

    const workshopMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      date: string;
      location: string;
      nominationName: string;
      nominationLimit: number;
      projects: Array<{
        id: string;
        name: string;
        team: string;
        teamOwner?: string;
        teamMembers?: string;
        teamDescription?: string;
        teamMaterialsUrl?: string;
        track: string;
        summary: string;
        description: string;
        duration: string;
        backgroundImage?: string;
        order: number;
      }>;
    }>();

    projectRecords.forEach((record, index) => {
      const fields = record.fields;
      if (fields["启用"] !== undefined && !asBoolean(fields["启用"], true)) return;
      const workshopId = asText(fields["工作坊ID"], "default-workshop");
      const teamId = asText(fields["项目组ID"]);
      const team = teams.get(teamId);
      const workshop = workshopMap.get(workshopId) ?? {
        id: workshopId,
        name: asText(fields["工作坊名称"], "工作坊评分"),
        code: asText(fields["工作坊编号"], workshopId),
        date: asDate(fields["日期"], "日期待定"),
        location: asText(fields["地点"], "地点待定"),
        nominationName: asText(fields["奖项名称"], "评委特别奖"),
        nominationLimit: Math.max(1, asNumber(fields["提名上限"], 2)),
        projects: [],
      };
      workshop.projects.push({
        id: asText(fields["项目ID"], record.record_id),
        name: asText(fields["项目名称"], `项目 ${index + 1}`),
        team: team?.name ?? asText(fields["项目组"], "未命名项目组"),
        teamOwner: team?.owner,
        teamMembers: team?.members,
        teamDescription: team?.description,
        teamMaterialsUrl: team?.materialsUrl,
        track: asText(fields["赛道"], "开放赛道"),
        summary: asText(fields["一句话介绍"], "项目简介待补充"),
        description: asUrl(fields["项目资料"], "项目资料待补充"),
        duration: asText(fields["路演时长"], "8 分钟路演 · 4 分钟问答"),
        backgroundImage: projectBackground(fields["项目背景图"], record.record_id, config.id),
        order: asNumber(fields["排序"], index + 1),
      });
      workshopMap.set(workshopId, workshop);
    });

    const workshops = Array.from(workshopMap.values())
      .map((workshop) => ({
        ...workshop,
        projects: workshop.projects
          .sort((left, right) => left.order - right.order)
          .map((project) => ({
            id: project.id,
            name: project.name,
            team: project.team,
            teamOwner: project.teamOwner,
            teamMembers: project.teamMembers,
            teamDescription: project.teamDescription,
            teamMaterialsUrl: project.teamMaterialsUrl,
            track: project.track,
            summary: project.summary,
            description: project.description,
            duration: project.duration,
            backgroundImage: project.backgroundImage,
          })),
      }))
      .filter((workshop) => workshop.projects.length > 0);

    const judges = judgeRecords
      .filter((record) => record.fields["启用"] === undefined || asBoolean(record.fields["启用"], true))
      .map((record, index) => ({
        id: asText(record.fields["评委ID"], record.record_id),
        name: asText(record.fields["评委姓名"], `评委 ${index + 1}`),
        seat: asText(record.fields["座位号"], `J${String(index + 1).padStart(2, "0")}`),
      }));

    const submissions: Record<string, Record<string, Record<string, unknown>>> = {};
    scoreRecords.forEach((record) => {
      const fields = record.fields;
      const workshopId = asText(fields["工作坊ID"]);
      const judgeId = asText(fields["评委ID"]);
      const projectId = asText(fields["项目ID"]);
      if (!workshopId || !judgeId || !projectId) return;
      const scores = Object.fromEntries(
        Object.entries(scoreFields)
          .map(([key, fieldName]) => [key, asNumber(fields[fieldName], Number.NaN)])
          .filter(([, value]) => Number.isFinite(value)),
      );
      submissions[workshopId] ??= {};
      submissions[workshopId][judgeId] ??= {};
      submissions[workshopId][judgeId][projectId] = {
        scores,
        nomination: fields["提名"] === undefined ? null : asBoolean(fields["提名"]),
        note: asText(fields["评审笔记"]),
        submittedAt: typeof fields["提交时间"] === "number"
          ? new Date(fields["提交时间"]).toISOString()
          : asText(fields["提交时间"], new Date().toISOString()),
        locked: asBoolean(fields["已锁票"]),
        judgeName: asText(fields["评委姓名"]),
        recordId: record.record_id,
      };
    });

    return NextResponse.json({
      connected: true,
      application: config.id ? { id: config.id, name: config.name, baseUrl: config.baseUrl } : undefined,
      empty: workshops.length === 0,
      workshops,
      judges,
      submissions,
      message: workshops.length
        ? `已从多维表格读取 ${teamRecords.length} 个项目组、${projectRecords.length} 个项目、${scoreRecords.length} 份评分。`
        : "多维表格已连接；项目表目前为空，请先填写项目和评委配置。",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取多维表格失败";
    return NextResponse.json({ connected: false, message }, { status: 502 });
  }
}
