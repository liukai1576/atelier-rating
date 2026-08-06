#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { SCORING_TEMPLATES } from "../lib/scoring.ts";

const cli = process.env.LARK_CLI_BIN || "lark-cli";
const identity = process.env.LARK_CLI_IDENTITY || "user";
const profile = process.env.LARK_CLI_PROFILE || "";
const registryBaseToken = process.env.FEISHU_REGISTRY_BASE_TOKEN || "";
const registryTableId = process.env.FEISHU_REGISTRY_TABLE_ID || "";

if (!registryBaseToken || !registryTableId) {
  throw new Error("缺少 FEISHU_REGISTRY_BASE_TOKEN 或 FEISHU_REGISTRY_TABLE_ID。");
}

function run(args) {
  const fullArgs = [...args, "--as", identity, "--format", "json"];
  if (profile) fullArgs.push("--profile", profile);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const stdout = execFileSync(cli, fullArgs, {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 45_000,
      });
      const payload = JSON.parse(stdout);
      if (payload.ok === false) throw new Error(payload.error?.message || "飞书 CLI 请求失败");
      return payload.data;
    } catch (error) {
      const stderr = error?.stderr?.toString?.() || "";
      const stdout = error?.stdout?.toString?.() || "";
      const detail = `${error?.message || ""} ${stderr} ${stdout}`;
      lastError = error;
      const transient = /EOF|ECONNRESET|ETIMEDOUT|timeout|TLS handshake|socket hang up|oauth\/v3\/token/i.test(detail);
      if (!transient || attempt === 3) throw error;
    }
  }
  throw lastError;
}

function listRecords(baseToken, tableId) {
  const data = run(["base", "+record-list", "--base-token", baseToken, "--table-id", tableId, "--limit", "200"]);
  if (data.items) return data.items;
  return (data.data || []).map((row, index) => ({
    record_id: data.record_id_list?.[index] || "",
    fields: Object.fromEntries((data.fields || []).map((field, fieldIndex) => [field, row[fieldIndex]])),
  }));
}

function listFields(baseToken, tableId) {
  return run(["base", "+field-list", "--base-token", baseToken, "--table-id", tableId]).fields || [];
}

function listTables(baseToken) {
  return run(["base", "+table-list", "--base-token", baseToken]).tables || [];
}

const rubricFields = [
  { name: "维度ID", type: "text" },
  { name: "排序", type: "number" },
  { name: "权重", type: "number" },
  { name: "维度名称", type: "text" },
  { name: "维度简称", type: "text" },
  { name: "维度简介", type: "text" },
  { name: "低分标题", type: "text" },
  { name: "低分说明", type: "text" },
  { name: "中分标题", type: "text" },
  { name: "中分说明", type: "text" },
  { name: "高分标题", type: "text" },
  { name: "高分说明", type: "text" },
  { name: "模板类型", type: "text" },
  { name: "标准版本", type: "text" },
  { name: "启用", type: "checkbox" },
];

const oldProjectFields = [
  "工作坊名称",
  "工作坊ID",
  "工作坊编号",
  "日期",
  "地点",
  "奖项名称",
  "提名上限",
  "路演时长",
  "项目组",
];

const scoreRenames = {
  "问题定义": "D1得分",
  "用户与业务价值": "D2得分",
  "方案创新性": "D3得分",
  "可行性与完成度": "D4得分",
  "影响力与可推广性": "D5得分",
  "表达与答辩": "D6得分",
};

let registryFields = listFields(registryBaseToken, registryTableId);
if (!registryFields.some((field) => field.name === "评分标准表ID")) {
  run([
    "base", "+field-create", "--base-token", registryBaseToken, "--table-id", registryTableId,
    "--json", JSON.stringify({ name: "评分标准表ID", type: "text" }),
  ]);
  registryFields = listFields(registryBaseToken, registryTableId);
}

const applications = listRecords(registryBaseToken, registryTableId)
  .filter((record) => record.fields.BaseToken && record.fields["项目表ID"] && record.fields["评分表ID"]);
const summary = [];

for (const application of applications) {
  const fields = application.fields;
  const name = String(fields["配置名称"] || fields["配置ID"] || "工作坊");
  const baseToken = String(fields.BaseToken);
  const tables = listTables(baseToken);
  const projectTableId = String(fields["项目表ID"]);
  const scoreTableId = String(fields["评分表ID"]);
  let rubricTable = tables.find((table) => table.name === "评分标准");
  if (!rubricTable) {
    rubricTable = run([
      "base", "+table-create", "--base-token", baseToken, "--name", "评分标准",
      "--fields", JSON.stringify(rubricFields),
    ]).table;
  }

  const templateId = /个人|舒克/.test(name) ? "personal" : "team";
  if (!listRecords(baseToken, rubricTable.id).length) {
    const criteria = SCORING_TEMPLATES[templateId].criteria;
    const recordFields = [
      "维度ID", "排序", "权重", "维度名称", "维度简称", "维度简介",
      "低分标题", "低分说明", "中分标题", "中分说明", "高分标题", "高分说明",
      "模板类型", "标准版本", "启用",
    ];
    const rows = criteria.map((criterion, index) => [
      criterion.id.toUpperCase(), index + 1, criterion.weight, criterion.name, criterion.shortName, criterion.description,
      criterion.rubrics[0].title, criterion.rubrics[0].text,
      criterion.rubrics[1].title, criterion.rubrics[1].text,
      criterion.rubrics[2].title, criterion.rubrics[2].text,
      templateId, "V1", true,
    ]);
    run([
      "base", "+record-batch-create", "--base-token", baseToken, "--table-id", rubricTable.id,
      "--json", JSON.stringify({ fields: recordFields, rows }),
    ]);
  }

  let scoreFields = listFields(baseToken, scoreTableId);
  for (const [oldName, newName] of Object.entries(scoreRenames)) {
    const oldField = scoreFields.find((field) => field.name === oldName);
    if (oldField && !scoreFields.some((field) => field.name === newName)) {
      run([
        "base", "+field-update", "--base-token", baseToken, "--table-id", scoreTableId,
        "--field-id", oldField.id, "--json", JSON.stringify({ name: newName, type: oldField.type }), "--yes",
      ]);
      scoreFields = listFields(baseToken, scoreTableId);
    }
  }
  if (!scoreFields.some((field) => field.name === "评分标准版本")) {
    run([
      "base", "+field-create", "--base-token", baseToken, "--table-id", scoreTableId,
      "--json", JSON.stringify({ name: "评分标准版本", type: "text" }),
    ]);
  }
  const scoreRecords = listRecords(baseToken, scoreTableId);
  const unversionedScoreIds = scoreRecords
    .filter((record) => !record.fields["评分标准版本"])
    .map((record) => record.record_id)
    .filter(Boolean);
  if (unversionedScoreIds.length) {
    run([
      "base", "+record-batch-update", "--base-token", baseToken, "--table-id", scoreTableId,
      "--json", JSON.stringify({ record_id_list: unversionedScoreIds, patch: { "评分标准版本": "V1" } }),
    ]);
  }

  let projectFields = listFields(baseToken, projectTableId);
  for (const fieldName of oldProjectFields) {
    const field = projectFields.find((item) => item.name === fieldName);
    if (!field) continue;
    run([
      "base", "+field-delete", "--base-token", baseToken, "--table-id", projectTableId,
      "--field-id", field.id, "--yes",
    ]);
    projectFields = projectFields.filter((item) => item.id !== field.id);
  }

  run([
    "base", "+record-upsert", "--base-token", registryBaseToken, "--table-id", registryTableId,
    "--record-id", application.record_id, "--json", JSON.stringify({ "评分标准表ID": rubricTable.id }),
  ]);
  summary.push({ name, templateId, rubricTableId: rubricTable.id, removedProjectFields: oldProjectFields });
}

console.log(JSON.stringify({ migrated: summary }, null, 2));
