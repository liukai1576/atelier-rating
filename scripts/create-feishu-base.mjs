#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const name = flag("--name", `Atelier 评分台 · 空白应用 ${new Date().toISOString().slice(0, 10)}`);
const identity = flag("--as", process.env.LARK_CLI_IDENTITY || "user");
const profile = flag("--profile", process.env.LARK_CLI_PROFILE || "");
const cli = process.env.LARK_CLI_BIN || "lark-cli";

const workshopFields = [
  { name: "工作坊名称", type: "text" },
  { name: "工作坊ID", type: "text" },
  { name: "日期", type: "text" },
  { name: "地点", type: "text" },
  { name: "奖项名称", type: "text" },
  { name: "提名上限", type: "number" },
  { name: "路演时长", type: "text" },
];

const projectFields = [
  { name: "项目名称", type: "text" },
  { name: "项目ID", type: "text" },
  { name: "项目组ID", type: "text" },
  { name: "赛道", type: "text" },
  { name: "一句话介绍", type: "text" },
  { name: "项目资料", type: "text", style: { type: "url" } },
  { name: "项目背景图", type: "attachment" },
  { name: "排序", type: "number" },
  { name: "启用", type: "checkbox" },
];

const scoreFields = [
  { name: "评分唯一键", type: "text" },
  { name: "工作坊ID", type: "text" },
  { name: "工作坊名称", type: "text" },
  { name: "项目ID", type: "text" },
  { name: "项目名称", type: "text" },
  { name: "项目组", type: "text" },
  { name: "评委ID", type: "text" },
  { name: "评委姓名", type: "text" },
  { name: "问题定义", type: "number" },
  { name: "用户与业务价值", type: "number" },
  { name: "方案创新性", type: "number" },
  { name: "可行性与完成度", type: "number" },
  { name: "影响力与可推广性", type: "number" },
  { name: "表达与答辩", type: "number" },
  { name: "加权总分", type: "number" },
  { name: "提名", type: "checkbox" },
  { name: "评审笔记", type: "text" },
  { name: "提交时间", type: "datetime", style: { format: "yyyy-MM-dd HH:mm" } },
  { name: "已锁票", type: "checkbox" },
];

const judgeFields = [
  { name: "评委姓名", type: "text" },
  { name: "评委ID", type: "text" },
  { name: "座位号", type: "text" },
  { name: "启用", type: "checkbox" },
];

const teamFields = [
  { name: "项目组名称", type: "text" },
  { name: "项目组ID", type: "text" },
  { name: "负责人", type: "text" },
  { name: "成员", type: "text" },
  { name: "项目组简介", type: "text" },
  { name: "资料链接", type: "text", style: { type: "url" } },
  { name: "启用", type: "checkbox" },
];

function run(args) {
  const fullArgs = [...args, "--as", identity, "--format", "json"];
  if (profile) fullArgs.push("--profile", profile);
  const stdout = execFileSync(cli, fullArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const payload = JSON.parse(stdout);
  if (payload.ok === false) {
    throw new Error(payload.error?.message || "飞书 CLI 请求失败");
  }
  return payload.data;
}

const created = run([
  "base",
  "+base-create",
  "--name",
  name,
  "--time-zone",
  "Asia/Shanghai",
  "--table-name",
  "工作坊",
  "--fields",
  JSON.stringify(workshopFields),
]);

const baseToken = created.base.base_token;
const workshopsTableId = created.table.id;
const projects = run(["base", "+table-create", "--base-token", baseToken, "--name", "项目", "--fields", JSON.stringify(projectFields)]);
const scores = run(["base", "+table-create", "--base-token", baseToken, "--name", "评分", "--fields", JSON.stringify(scoreFields)]);
const judges = run(["base", "+table-create", "--base-token", baseToken, "--name", "评委", "--fields", JSON.stringify(judgeFields)]);
const teams = run(["base", "+table-create", "--base-token", baseToken, "--name", "项目组", "--fields", JSON.stringify(teamFields)]);

const result = {
  name,
  url: created.base.url,
  baseToken,
  tables: {
    workshops: workshopsTableId,
    projects: projects.table.id,
    scores: scores.table.id,
    judges: judges.table.id,
    teams: teams.table.id,
  },
  env: [
    `FEISHU_BITABLE_APP_TOKEN=${baseToken}`,
    `FEISHU_WORKSHOPS_TABLE_ID=${workshopsTableId}`,
    `FEISHU_PROJECTS_TABLE_ID=${projects.table.id}`,
    `FEISHU_SCORES_TABLE_ID=${scores.table.id}`,
    `FEISHU_TEAMS_TABLE_ID=${teams.table.id}`,
    `FEISHU_JUDGES_TABLE_ID=${judges.table.id}`,
  ].join("\n"),
};

console.log(JSON.stringify(result, null, 2));
