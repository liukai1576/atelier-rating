"use client";

import Link from "next/link";
import { useState } from "react";

type RatingApplication = {
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
};

const ADMIN_SESSION_KEY = "atelier-config-admin-key";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [applications, setApplications] = useState<RatingApplication[]>([]);
  const [templateUrl, setTemplateUrl] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadAdmin = async (key: string) => {
    const response = await fetch("/api/configurations?admin=1", {
      cache: "no-store",
      headers: { "x-atelier-admin-key": key },
    });
    const payload = await response.json() as {
      applications?: RatingApplication[];
      templateUrl?: string;
      message?: string;
    };
    if (!response.ok) throw new Error(payload.message || "无法进入配置后台。");
    setApplications(payload.applications ?? []);
    setTemplateUrl(payload.templateUrl ?? "");
    setAuthenticated(true);
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, key);
  };

  const signIn = async () => {
    if (!adminKey || busy) return;
    setBusy(true);
    setMessage("正在验证管理权限…");
    try {
      await loadAdmin(adminKey);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "管理密钥不正确。");
    } finally {
      setBusy(false);
    }
  };

  const saveConfiguration = async () => {
    if (!name.trim() || !baseUrl.trim() || busy) return;
    setBusy(true);
    setMessage("正在读取 Base 并校验四张业务表…");
    try {
      const response = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-atelier-admin-key": adminKey },
        body: JSON.stringify({ name: name.trim(), baseUrl: baseUrl.trim() }),
      });
      const payload = await response.json() as {
        saved?: boolean;
        applications?: RatingApplication[];
        application?: RatingApplication;
        message?: string;
      };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "评分表未通过模板校验。");
      setApplications(payload.applications ?? []);
      setName("");
      setBaseUrl("");
      setMessage(`已加入系统：${payload.application?.name ?? "新评分项目"}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleApplication = async (application: RatingApplication) => {
    if (busy) return;
    setBusy(true);
    setMessage(`正在${application.enabled ? "停用" : "启用"}「${application.name}」…`);
    try {
      const response = await fetch("/api/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-atelier-admin-key": adminKey },
        body: JSON.stringify({ id: application.id, enabled: !application.enabled }),
      });
      const payload = await response.json() as { saved?: boolean; applications?: RatingApplication[]; message?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "更新状态失败");
      setApplications(payload.applications ?? []);
      setMessage(`「${application.name}」已${application.enabled ? "停用" : "启用"}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setBusy(false);
    }
  };

  if (!authenticated) {
    return (
      <main className="admin-login-shell">
        <form className="admin-login-card" onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <p className="eyebrow">ATELIER ADMIN</p>
          <h1>配置后台</h1>
          <p>此入口仅供评分台管理员使用，评委端不会显示。</p>
          <label>
            <span>管理密钥</span>
            <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <button disabled={busy || !adminKey}>{busy ? "正在验证…" : "进入配置后台"}</button>
          {message && <p className="config-message" role="status">{message}</p>}
          <Link href="/">返回评分台</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="config-view admin-config-page" data-testid="configuration-center">
      <header className="config-heading">
        <div>
          <span className="eyebrow">RATING PROJECT SETUP · ADMIN ONLY</span>
          <h1>评分项目配置</h1>
          <p>接入符合 Atelier 模板的飞书 Base，并控制哪些评分项目对评委可见。</p>
        </div>
        <div className="admin-header-actions">
          <Link href="/">返回评分台</Link>
          <button onClick={() => {
            window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
            setAuthenticated(false);
            setAdminKey("");
          }}>退出管理</button>
        </div>
      </header>

      <div className="config-layout">
        <form className="config-form" onSubmit={(event) => {
          event.preventDefault();
          void saveConfiguration();
        }}>
          <div className="config-step"><span>01</span><div><strong>复制模板</strong><p>复制标准 Base，再填写项目、项目组和评委；评分表保持空白。</p></div></div>
          <div className="config-step"><span>02</span><div><strong>接入系统</strong><p>粘贴新 Base 链接，系统自动识别表 ID 并校验必需字段。</p></div></div>
          {templateUrl && <a className="template-link" href={templateUrl} target="_blank" rel="noreferrer">打开标准空白模板 ↗</a>}
          <label>
            <span>评分项目名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：AI 产品工作坊 · 2026 秋季场" required />
          </label>
          <label>
            <span>飞书多维表格 Base 链接</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://你的组织.feishu.cn/base/..." required />
          </label>
          <button className="config-submit" disabled={busy || !name.trim() || !baseUrl.trim()}>
            {busy ? "正在处理…" : "校验并加入系统"}
          </button>
          {message && <p className="config-message" role="status">{message}</p>}
        </form>

        <section className="application-list" aria-label="已配置评分项目">
          <header><div><span className="eyebrow">CONNECTED BASES</span><h2>已配置项目</h2></div><strong>{applications.length}</strong></header>
          {applications.map((application) => (
            <article className={application.enabled ? "active" : ""} key={application.id}>
              <div>
                <small>{application.enabled ? "评委可见" : "已隐藏"}</small>
                <h3>{application.name}</h3>
                <p>项目 {application.projectsTableId} · 评分 {application.scoresTableId}</p>
              </div>
              <div className="application-actions">
                <a href={application.baseUrl} target="_blank" rel="noreferrer">打开 Base ↗</a>
                <button disabled={busy} onClick={() => void toggleApplication(application)}>
                  {application.enabled ? "从评委端隐藏" : "启用并展示"}
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
