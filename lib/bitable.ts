import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type BitableConfig = {
  id?: string;
  name?: string;
  baseUrl?: string;
  appToken: string;
  projectsTableId: string;
  scoresTableId: string;
  judgesTableId?: string;
  teamsTableId?: string;
  cliBin: string;
  profile?: string;
  identity: "user" | "bot";
};

type CliEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    message?: string;
    hint?: string;
  };
};

const execFileAsync = promisify(execFile);

const REQUIRED_TABLE_FIELDS: Record<string, string[]> = {
  "项目": ["项目名称", "工作坊ID", "工作坊名称", "项目ID", "项目背景图", "排序", "启用"],
  "评分": ["评分唯一键", "工作坊ID", "项目ID", "评委ID", "加权总分", "已锁票"],
  "评委": ["评委姓名", "评委ID", "启用"],
  "项目组": ["项目组名称", "项目组ID", "启用"],
};

export function getBitableConfig(): BitableConfig | null {
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN?.trim();
  const projectsTableId = process.env.FEISHU_PROJECTS_TABLE_ID?.trim();
  const scoresTableId = process.env.FEISHU_SCORES_TABLE_ID?.trim();
  if (!appToken || !projectsTableId || !scoresTableId) {
    return null;
  }
  const identity = process.env.LARK_CLI_IDENTITY?.trim() === "bot" ? "bot" : "user";
  return {
    appToken,
    projectsTableId,
    scoresTableId,
    judgesTableId: process.env.FEISHU_JUDGES_TABLE_ID?.trim() || undefined,
    teamsTableId: process.env.FEISHU_TEAMS_TABLE_ID?.trim() || undefined,
    cliBin: process.env.LARK_CLI_BIN?.trim() || "lark-cli",
    profile: process.env.LARK_CLI_PROFILE?.trim() || undefined,
    identity,
  };
}

function getCliRuntime() {
  return {
    cliBin: process.env.LARK_CLI_BIN?.trim() || "lark-cli",
    profile: process.env.LARK_CLI_PROFILE?.trim() || undefined,
    identity: process.env.LARK_CLI_IDENTITY?.trim() === "bot" ? "bot" as const : "user" as const,
  };
}

function getRegistryCoordinates() {
  const appToken = process.env.FEISHU_REGISTRY_BASE_TOKEN?.trim();
  const tableId = process.env.FEISHU_REGISTRY_TABLE_ID?.trim();
  return appToken && tableId ? { appToken, tableId } : null;
}

export async function runBaseCommand<T>(
  config: BitableConfig,
  command: string,
  args: string[],
  options?: { cwd?: string },
) {
  const cliArgs = [
    "base",
    command,
    ...args,
    "--as",
    config.identity,
  ];
  if (config.profile) cliArgs.push("--profile", config.profile);

  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(config.cliBin, cliArgs, {
      cwd: options?.cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 45_000,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
    if (!stdout.trim()) {
      try {
        const parsed = JSON.parse(stderr) as CliEnvelope<unknown>;
        const detail = [parsed.error?.message, parsed.error?.hint].filter(Boolean).join("；");
        throw new Error(`飞书 CLI 请求失败：${detail || failure.message}`);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.startsWith("飞书 CLI 请求失败")) throw parseError;
        throw new Error(`飞书 CLI 执行失败：${stderr.trim() || failure.message}`);
      }
    }
  }

  let payload: CliEnvelope<T>;
  try {
    payload = JSON.parse(stdout) as CliEnvelope<T>;
  } catch {
    throw new Error(`飞书 CLI 返回了非 JSON 内容：${stderr.trim() || stdout.trim()}`);
  }
  if (payload.ok === false) {
    const detail = [payload.error?.message, payload.error?.hint].filter(Boolean).join("；");
    throw new Error(`飞书 CLI 请求失败：${detail || "未知错误"}`);
  }
  return (payload.data ?? payload) as T;
}

export function extractBaseToken(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/base\/([a-zA-Z0-9]+)/);
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9]{10,}$/.test(trimmed) ? trimmed : "";
}

export async function listTables(config: BitableConfig) {
  const data = await runBaseCommand<{ tables?: Array<{ id: string; name: string }> }>(
    config,
    "+table-list",
    ["--base-token", config.appToken, "--format", "json"],
  );
  return data.tables ?? [];
}

export async function listFields(config: BitableConfig, tableId: string) {
  const data = await runBaseCommand<{ fields?: Array<{ id: string; name: string; type: string }> }>(
    config,
    "+field-list",
    ["--base-token", config.appToken, "--table-id", tableId, "--format", "json"],
  );
  return data.fields ?? [];
}

export type RegisteredApplication = {
  id: string;
  name: string;
  baseUrl: string;
  appToken: string;
  projectsTableId: string;
  scoresTableId: string;
  judgesTableId: string;
  teamsTableId: string;
  enabled: boolean;
  order: number;
  recordId?: string;
};

function applicationFromRecord(record: FeishuRecord): RegisteredApplication | null {
  const fields = record.fields;
  const id = asText(fields["配置ID"]);
  const appToken = asText(fields["BaseToken"]);
  const projectsTableId = asText(fields["项目表ID"]);
  const scoresTableId = asText(fields["评分表ID"]);
  if (!id || !appToken || !projectsTableId || !scoresTableId) return null;
  return {
    id,
    name: asText(fields["配置名称"], id),
    baseUrl: asUrl(fields["Base链接"], `https://rollingdigital.feishu.cn/base/${appToken}`),
    appToken,
    projectsTableId,
    scoresTableId,
    judgesTableId: asText(fields["评委表ID"]),
    teamsTableId: asText(fields["项目组表ID"]),
    enabled: fields["启用"] === undefined || asBoolean(fields["启用"], true),
    order: asNumber(fields["排序"], 100),
    recordId: record.record_id,
  };
}

export async function listRegisteredApplications() {
  const registry = getRegistryCoordinates();
  if (!registry) {
    const fallback = getBitableConfig();
    return fallback ? [{
      id: "default",
      name: "默认评分项目",
      baseUrl: `https://rollingdigital.feishu.cn/base/${fallback.appToken}`,
      appToken: fallback.appToken,
      projectsTableId: fallback.projectsTableId,
      scoresTableId: fallback.scoresTableId,
      judgesTableId: fallback.judgesTableId ?? "",
      teamsTableId: fallback.teamsTableId ?? "",
      enabled: true,
      order: 1,
    } satisfies RegisteredApplication] : [];
  }
  const runtime = getCliRuntime();
  const registryConfig: BitableConfig = {
    ...runtime,
    appToken: registry.appToken,
    projectsTableId: registry.tableId,
    scoresTableId: registry.tableId,
  };
  const records = await listRecords(registryConfig, registry.tableId);
  return records
    .map(applicationFromRecord)
    .filter((item): item is RegisteredApplication => Boolean(item))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, "zh-CN"));
}

export async function resolveBitableConfig(applicationId?: string | null): Promise<BitableConfig | null> {
  const applications = await listRegisteredApplications();
  const application = applications.find((item) => item.id === applicationId && item.enabled)
    ?? applications.find((item) => item.enabled);
  if (!application) return getBitableConfig();
  return {
    ...getCliRuntime(),
    id: application.id,
    name: application.name,
    baseUrl: application.baseUrl,
    appToken: application.appToken,
    projectsTableId: application.projectsTableId,
    scoresTableId: application.scoresTableId,
    judgesTableId: application.judgesTableId || undefined,
    teamsTableId: application.teamsTableId || undefined,
  };
}

export async function validateBaseTemplate(baseReference: string) {
  const appToken = extractBaseToken(baseReference);
  if (!appToken) throw new Error("请输入有效的飞书多维表格 Base 链接或 Base Token。");
  const config: BitableConfig = {
    ...getCliRuntime(),
    appToken,
    projectsTableId: "",
    scoresTableId: "",
  };
  const tables = await listTables(config);
  const matched = Object.fromEntries(
    Object.keys(REQUIRED_TABLE_FIELDS).map((name) => [name, tables.find((table) => table.name === name)]),
  ) as Record<string, { id: string; name: string } | undefined>;
  const missingTables = Object.entries(matched).filter(([, table]) => !table).map(([name]) => name);
  if (missingTables.length) {
    return { valid: false, appToken, missingTables, missingFields: {} as Record<string, string[]> };
  }
  const fieldEntries = await Promise.all(Object.entries(matched).map(async ([name, table]) => {
    const fields = await listFields(config, table!.id);
    const names = new Set(fields.map((field) => field.name));
    return [name, REQUIRED_TABLE_FIELDS[name].filter((field) => !names.has(field))] as const;
  }));
  const missingFields = Object.fromEntries(fieldEntries.filter(([, fields]) => fields.length));
  return {
    valid: Object.keys(missingFields).length === 0,
    appToken,
    baseUrl: baseReference.includes("/base/") ? baseReference.split("?")[0] : `https://rollingdigital.feishu.cn/base/${appToken}`,
    tables: {
      projects: matched["项目"]!.id,
      scores: matched["评分"]!.id,
      judges: matched["评委"]!.id,
      teams: matched["项目组"]!.id,
    },
    missingTables,
    missingFields,
  };
}

export async function saveRegisteredApplication(input: {
  id: string;
  name: string;
  baseUrl: string;
  appToken: string;
  tables: { projects: string; scores: string; judges: string; teams: string };
}) {
  const registry = getRegistryCoordinates();
  if (!registry) throw new Error("服务器尚未配置飞书评分项目配置中心。");
  const registryConfig: BitableConfig = {
    ...getCliRuntime(),
    appToken: registry.appToken,
    projectsTableId: registry.tableId,
    scoresTableId: registry.tableId,
  };
  const records = await listRecords(registryConfig, registry.tableId);
  const existing = records.find((record) =>
    asText(record.fields["配置ID"]) === input.id || asText(record.fields["BaseToken"]) === input.appToken,
  );
  const fields = {
    "配置名称": input.name,
    "配置ID": input.id,
    "Base链接": input.baseUrl,
    "BaseToken": input.appToken,
    "项目表ID": input.tables.projects,
    "评分表ID": input.tables.scores,
    "项目组表ID": input.tables.teams,
    "评委表ID": input.tables.judges,
    "启用": true,
    "排序": existing ? asNumber(existing.fields["排序"], records.length + 1) : records.length + 1,
    "创建时间": new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(new Date()),
  };
  if (existing) await updateRecord(registryConfig, registry.tableId, existing.record_id, fields);
  else await createRecord(registryConfig, registry.tableId, fields);
  return input;
}

export async function setRegisteredApplicationEnabled(id: string, enabled: boolean) {
  const registry = getRegistryCoordinates();
  if (!registry) throw new Error("服务器尚未配置飞书评分项目配置中心。");
  const registryConfig: BitableConfig = {
    ...getCliRuntime(),
    appToken: registry.appToken,
    projectsTableId: registry.tableId,
    scoresTableId: registry.tableId,
  };
  const records = await listRecords(registryConfig, registry.tableId);
  const existing = records.find((record) => asText(record.fields["配置ID"]) === id);
  if (!existing) throw new Error("找不到指定的评分项目配置。");
  await updateRecord(registryConfig, registry.tableId, existing.record_id, { "启用": enabled });
  return { id, enabled };
}

export async function downloadProjectAttachment(
  config: BitableConfig,
  recordId: string,
  fileToken: string,
) {
  const workDir = await mkdtemp(join(tmpdir(), "atelier-project-image-"));
  const outputPath = join(workDir, "attachment");
  try {
    const data = await runBaseCommand<{
      downloaded?: Array<{
        content_type?: string;
        name?: string;
        saved_path?: string;
      }>;
    }>(
      config,
      "+record-download-attachment",
      [
        "--base-token",
        config.appToken,
        "--table-id",
        config.projectsTableId,
        "--record-id",
        recordId,
        "--file-token",
        fileToken,
        "--output",
        "./attachment",
        "--overwrite",
        "--format",
        "json",
      ],
      { cwd: workDir },
    );
    const item = data.downloaded?.[0];
    const bytes = await readFile(item?.saved_path || outputPath);
    return {
      bytes,
      contentType: item?.content_type || "application/octet-stream",
      name: item?.name || "project-background",
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function listRecords(config: BitableConfig, tableId: string) {
  const records: FeishuRecord[] = [];
  let offset = 0;
  const limit = 200;
  do {
    const data = await runBaseCommand<{
      data?: unknown[][];
      fields?: string[];
      record_id_list?: string[];
      items?: FeishuRecord[];
      records?: FeishuRecord[];
      has_more?: boolean;
      total?: number;
    }>(
      config,
      "+record-list",
      [
        "--base-token",
        config.appToken,
        "--table-id",
        tableId,
        "--offset",
        String(offset),
        "--limit",
        String(limit),
        "--format",
        "json",
      ],
    );
    const page = data.items
      ?? data.records
      ?? (data.data ?? []).map((row, index) => ({
        record_id: data.record_id_list?.[index] ?? "",
        fields: Object.fromEntries(
          (data.fields ?? []).map((field, fieldIndex) => [field, row[fieldIndex]]),
        ),
      }));
    records.push(...page);
    offset += page.length;
    if (!data.has_more && page.length < limit) break;
    if (data.total !== undefined && offset >= data.total) break;
    if (!page.length) break;
  } while (true);
  return records;
}

export async function createRecord(
  config: BitableConfig,
  tableId: string,
  fields: Record<string, unknown>,
) {
  const data = await runBaseCommand<{
    id?: string;
    record?: FeishuRecord & { id?: string };
    record_id_list?: string[];
  } & Partial<FeishuRecord>>(
    config,
    "+record-upsert",
    [
      "--base-token",
      config.appToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify(fields),
      "--format",
      "json",
    ],
  );
  const record = data.record ?? (data as FeishuRecord);
  const returnedRecordId = record.record_id
    || ("id" in record && typeof record.id === "string" ? record.id : "")
    || data.id
    || data.record_id_list?.[0];
  if (returnedRecordId) {
    return { record: { ...record, record_id: returnedRecordId } };
  }

  // Some CLI versions omit the created record ID from +record-upsert output.
  // Re-read the table and resolve the just-created row by its business key.
  const keyField = ["评分唯一键", "配置ID"].find((field) => fields[field] !== undefined);
  const uniqueKey = keyField ? fields[keyField] : undefined;
  if (keyField && uniqueKey !== undefined) {
    const records = await listRecords(config, tableId);
    const created = records.find(
      (item) => asText(item.fields[keyField]) === asText(uniqueKey),
    );
    if (created) return { record: created };
  }
  throw new Error("飞书 CLI 已执行写入，但无法回读新记录的 record_id。");
}

export async function updateRecord(
  config: BitableConfig,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  const data = await runBaseCommand<{ record?: FeishuRecord } & Partial<FeishuRecord>>(
    config,
    "+record-upsert",
    [
      "--base-token",
      config.appToken,
      "--table-id",
      tableId,
      "--record-id",
      recordId,
      "--json",
      JSON.stringify(fields),
      "--format",
      "json",
    ],
  );
  const record = data.record ?? (data as FeishuRecord);
  return { record: { ...record, record_id: record.record_id || recordId } };
}

export async function batchUpdateRecords(
  config: BitableConfig,
  tableId: string,
  recordIds: string[],
  patch: Record<string, unknown>,
) {
  for (let index = 0; index < recordIds.length; index += 200) {
    const recordIdList = recordIds.slice(index, index + 200);
    await runBaseCommand(
      config,
      "+record-batch-update",
      [
        "--base-token",
        config.appToken,
        "--table-id",
        tableId,
        "--json",
        JSON.stringify({ record_id_list: recordIdList, patch }),
        "--format",
        "json",
      ],
    );
  }
}

export function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return asText(record.text ?? record.name ?? record.value ?? record.link);
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return asText(record.text ?? record.name ?? record.value);
  }
  return fallback;
}

export function asUrl(value: unknown, fallback = ""): string {
  const text = asText(value, fallback);
  const markdownLink = text.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/);
  return markdownLink?.[1] ?? text;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (["true", "yes", "是", "1", "启用"].includes(text)) return true;
  if (["false", "no", "否", "0", "停用"].includes(text)) return false;
  return fallback;
}

export function asDate(value: unknown, fallback: string) {
  if (typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10).replaceAll("-", ".");
  }
  const text = asText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10).replaceAll("-", ".");
}

export type { BitableConfig, FeishuRecord };
