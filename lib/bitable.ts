import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

type FeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type BitableConfig = {
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

async function runBaseCommand<T>(
  config: BitableConfig,
  command: string,
  args: string[],
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
      throw new Error(`飞书 CLI 执行失败：${stderr.trim() || failure.message}`);
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
  const uniqueKey = fields["评分唯一键"];
  if (uniqueKey !== undefined) {
    const records = await listRecords(config, tableId);
    const created = records.find(
      (item) => asText(item.fields["评分唯一键"]) === asText(uniqueKey),
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
