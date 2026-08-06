"use client";

import Link from "next/link";
import { useState } from "react";
import type { Criterion, ScoringTemplateId } from "@/lib/scoring";
import { cloneCriteria, SCORING_TEMPLATES } from "@/lib/scoring";

type RatingApplication = {
  id: string;
  name: string;
  baseUrl: string;
  appToken: string;
  workshopsTableId: string;
  rubricsTableId: string;
  projectsTableId: string;
  scoresTableId: string;
  judgesTableId: string;
  teamsTableId: string;
  enabled: boolean;
  order: number;
};

type JudgeAccessLink = {
  id: string;
  name: string;
  seat: string;
  url: string;
  expiresAt: string;
};

const ADMIN_SESSION_KEY = "atelier-config-admin-key";
const judgePath = (id: string) => `/?app=${encodeURIComponent(id)}`;

function CriteriaEditor({
  criteria,
  disabled,
  onChange,
}: {
  criteria: Criterion[];
  disabled?: boolean;
  onChange: (criteria: Criterion[]) => void;
}) {
  const update = (index: number, patch: Partial<Criterion>) => {
    const next = cloneCriteria(criteria);
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const updateRubric = (criterionIndex: number, rubricIndex: number, field: "title" | "text", value: string) => {
    const next = cloneCriteria(criteria);
    next[criterionIndex].rubrics[rubricIndex][field] = value;
    onChange(next);
  };
  return (
    <div className="rubric-editor">
      {criteria.map((criterion, index) => (
        <article key={criterion.id}>
          <header><strong>{criterion.id.toUpperCase()}</strong><span>{criterion.weight}%</span></header>
          <label>
            <span>维度名称</span>
            <input disabled={disabled} value={criterion.name} onChange={(event) => update(index, { name: event.target.value, shortName: event.target.value.slice(0, 6) })} />
          </label>
          <label>
            <span>维度简介</span>
            <textarea disabled={disabled} value={criterion.description} onChange={(event) => update(index, { description: event.target.value })} />
          </label>
          <details>
            <summary>低、中、高分判定</summary>
            {criterion.rubrics.map((rubric, rubricIndex) => (
              <div className="rubric-band-editor" key={rubric.range}>
                <strong>{rubric.range}</strong>
                <input disabled={disabled} aria-label={`${criterion.name}${rubric.range}标题`} value={rubric.title} onChange={(event) => updateRubric(index, rubricIndex, "title", event.target.value)} />
                <textarea disabled={disabled} aria-label={`${criterion.name}${rubric.range}说明`} value={rubric.text} onChange={(event) => updateRubric(index, rubricIndex, "text", event.target.value)} />
              </div>
            ))}
          </details>
        </article>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [applications, setApplications] = useState<RatingApplication[]>([]);
  const [templateUrl, setTemplateUrl] = useState("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [templateId, setTemplateId] = useState<ScoringTemplateId>("team");
  const [criteria, setCriteria] = useState<Criterion[]>(() => cloneCriteria(SCORING_TEMPLATES.team.criteria));
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [rubricApplicationId, setRubricApplicationId] = useState("");
  const [rubricTemplateId, setRubricTemplateId] = useState<ScoringTemplateId>("team");
  const [rubricCriteria, setRubricCriteria] = useState<Criterion[]>([]);
  const [rubricLocked, setRubricLocked] = useState(false);
  const [judgeLinkApplicationId, setJudgeLinkApplicationId] = useState("");
  const [judgeLinks, setJudgeLinks] = useState<JudgeAccessLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const authenticateAdmin = async (key: string) => {
    const response = await fetch("/api/configurations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "authenticate", adminKey: key }),
    });
    const payload = await response.json() as { authenticated?: boolean; message?: string };
    if (!response.ok || !payload.authenticated) throw new Error(payload.message || "管理密钥不正确。");
  };

  const loadApplications = async (key: string) => {
    const response = await fetch("/api/configurations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", adminKey: key }),
    });
    const payload = await response.json() as {
      applications?: RatingApplication[];
      templateUrl?: string;
      message?: string;
    };
    if (!response.ok) throw new Error(payload.message || "读取飞书配置失败。");
    setApplications(payload.applications ?? []);
    setTemplateUrl(payload.templateUrl ?? "");
  };

  const signIn = async () => {
    if (!adminKey || busy) return;
    setBusy(true);
    setMessage("正在验证管理权限…");
    try {
      await authenticateAdmin(adminKey);
      setAuthenticated(true);
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, adminKey);
      setMessage("管理权限验证成功，正在读取飞书配置…");
      try {
        await loadApplications(adminKey);
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? `${error.message} 可点击“重新读取配置”重试。` : "读取飞书配置失败，可重试。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "管理密钥不正确。");
    } finally {
      setBusy(false);
    }
  };

  const saveConfiguration = async () => {
    if (!name.trim() || !baseUrl.trim() || busy) return;
    setBusy(true);
    setMessage("正在读取 Base 并校验六张业务表…");
    try {
      const response = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), baseUrl: baseUrl.trim(), templateId, criteria, adminKey }),
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
      setTemplateId("team");
      setCriteria(cloneCriteria(SCORING_TEMPLATES.team.criteria));
      setMessage(`已加入系统：${payload.application?.name ?? "新工作坊"}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const chooseTemplate = (
    nextTemplate: ScoringTemplateId,
    setTemplate: (value: ScoringTemplateId) => void,
    setValues: (value: Criterion[]) => void,
  ) => {
    setTemplate(nextTemplate);
    setValues(cloneCriteria(SCORING_TEMPLATES[nextTemplate].criteria));
  };

  const loadRubric = async (application: RatingApplication) => {
    if (busy) return;
    setBusy(true);
    setMessage(`正在读取「${application.name}」的评分标准…`);
    try {
      const response = await fetch(`/api/configurations/rubric?appId=${encodeURIComponent(application.id)}`, {
        headers: { "x-atelier-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json() as {
        criteria?: Criterion[];
        templateId?: ScoringTemplateId;
        locked?: boolean;
        scoreCount?: number;
        message?: string;
      };
      if (!response.ok || !payload.criteria) throw new Error(payload.message || "读取评分标准失败");
      setRubricApplicationId(application.id);
      setRubricTemplateId(payload.templateId === "personal" ? "personal" : "team");
      setRubricCriteria(cloneCriteria(payload.criteria));
      setRubricLocked(Boolean(payload.locked));
      setMessage(payload.locked ? `已有 ${payload.scoreCount ?? 0} 份评分，标准已锁定。` : "评分标准可以修改，保存后将直接写入该工作坊的 Base。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取评分标准失败");
    } finally {
      setBusy(false);
    }
  };

  const saveRubric = async () => {
    if (!rubricApplicationId || rubricLocked || busy) return;
    setBusy(true);
    setMessage("正在把评分标准写入飞书多维表格…");
    try {
      const response = await fetch("/api/configurations/rubric", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: rubricApplicationId, templateId: rubricTemplateId, criteria: rubricCriteria, adminKey }),
      });
      const payload = await response.json() as { saved?: boolean; message?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "保存评分标准失败");
      setMessage("评分标准已写入该工作坊的飞书 Base。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存评分标准失败");
    } finally {
      setBusy(false);
    }
  };

  const renameApplication = async (application: RatingApplication) => {
    const nextName = editingName.trim();
    if (!nextName || busy) return;
    setBusy(true);
    setMessage(`正在修改「${application.name}」对应的飞书 Base 文件名…`);
    try {
      const response = await fetch("/api/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: application.id, name: nextName, adminKey }),
      });
      const payload = await response.json() as { saved?: boolean; applications?: RatingApplication[]; message?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "修改名称失败");
      setApplications(payload.applications ?? []);
      setEditingId("");
      setEditingName("");
      setMessage(`飞书 Base 与工作坊配置均已改名为「${nextName}」，原评委链接继续有效。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改名称失败");
    } finally {
      setBusy(false);
    }
  };

  const copyWorkshopLink = async (application: RatingApplication) => {
    const url = `${window.location.origin}${judgePath(application.id)}`;
    await window.navigator.clipboard.writeText(url);
    setMessage(`已复制「${application.name}」的公开评分台链接。`);
  };

  const loadJudgeLinks = async (application: RatingApplication) => {
    if (busy) return;
    setBusy(true);
    setMessage(`正在从「${application.name}」的评委表生成个人专属链接…`);
    try {
      const response = await fetch("/api/auth/judge-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: application.id, adminKey }),
      });
      const payload = await response.json() as { judges?: JudgeAccessLink[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "生成评委专属链接失败");
      setJudgeLinkApplicationId(application.id);
      setJudgeLinks(payload.judges ?? []);
      setMessage(payload.judges?.length
        ? `已按飞书评委表生成 ${payload.judges.length} 条个人专属链接。`
        : "评委表中没有启用的评委，请先在飞书中填写。"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成评委专属链接失败");
    } finally {
      setBusy(false);
    }
  };

  const copyPersonalJudgeLink = async (judgeLink: JudgeAccessLink) => {
    await window.navigator.clipboard.writeText(judgeLink.url);
    setMessage(`已复制「${judgeLink.name}」的个人专属登录链接。`);
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
          <Link href="/">返回工作坊评分台</Link>
        </form>
      </main>
    );
  }

  const returnApplication = applications[0];
  const returnPath = returnApplication ? judgePath(returnApplication.id) : "/";

  return (
    <main className="config-view admin-config-page" data-testid="configuration-center">
      <header className="config-heading">
        <div>
          <span className="eyebrow">WORKSHOP SETUP · ADMIN ONLY</span>
          <h1>工作坊配置</h1>
          <p>每个工作坊连接一个符合 Atelier 模板的飞书 Base；Base 里填写参评项目、项目组和评委。</p>
        </div>
        <div className="admin-header-actions">
          <Link href={returnPath}>返回当前工作坊</Link>
          <button disabled={busy} onClick={() => {
            setBusy(true);
            setMessage("正在重新读取飞书配置…");
            void loadApplications(adminKey)
              .then(() => setMessage("配置已刷新。"))
              .catch((error) => setMessage(error instanceof Error ? error.message : "读取飞书配置失败"))
              .finally(() => setBusy(false));
          }}>重新读取配置</button>
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
          <div className="config-step"><span>01</span><div><strong>复制模板</strong><p>一个工作坊复制一份标准 Base，再填写参评项目、项目组和评委；评分表保持空白。</p></div></div>
          <div className="config-step"><span>02</span><div><strong>接入工作坊</strong><p>填写工作坊名称并粘贴 Base 链接；接入后可按评委表生成个人专属入口。</p></div></div>
          {templateUrl && <a className="template-link" href={templateUrl} target="_blank" rel="noreferrer">打开标准空白模板 ↗</a>}
          <label>
            <span>工作坊名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：AI 产品工作坊 · 2026 秋季场" required />
          </label>
          <label>
            <span>飞书多维表格 Base 链接</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://你的组织.feishu.cn/base/..." required />
          </label>
          <fieldset className="template-picker">
            <legend>评分模板</legend>
            {(["personal", "team"] as ScoringTemplateId[]).map((item) => (
              <button
                className={templateId === item ? "active" : ""}
                type="button"
                key={item}
                onClick={() => chooseTemplate(item, setTemplateId, setCriteria)}
              >
                <strong>{SCORING_TEMPLATES[item].name}</strong>
                <span>{item === "personal" ? "强调 Demo、个人成长与反思" : "强调商业价值、收益测算与规模化"}</span>
              </button>
            ))}
          </fieldset>
          <CriteriaEditor criteria={criteria} disabled={busy} onChange={setCriteria} />
          <button className="config-submit" disabled={busy || !name.trim() || !baseUrl.trim()}>
            {busy ? "正在处理…" : "校验并加入系统"}
          </button>
          {message && <p className="config-message" role="status">{message}</p>}
        </form>

        <section className="application-list" aria-label="已配置工作坊">
          <header><div><span className="eyebrow">CONNECTED WORKSHOPS</span><h2>已配置工作坊</h2></div><strong>{applications.length}</strong></header>
          {applications.map((application) => (
            <article className="active" key={application.id}>
              <div>
                <small>评分台可访问</small>
                {editingId === application.id ? (
                  <div className="application-name-editor">
                    <input aria-label="工作坊名称" value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                    <button disabled={busy || !editingName.trim()} onClick={() => void renameApplication(application)}>保存名称</button>
                    <button disabled={busy} onClick={() => { setEditingId(""); setEditingName(""); }}>取消</button>
                  </div>
                ) : <h3>{application.name}</h3>}
                <p>工作坊表 {application.workshopsTableId || "未配置"} · 评分标准表 {application.rubricsTableId || "未配置"} · 参评项目表 {application.projectsTableId} · 评分表 {application.scoresTableId}</p>
              </div>
              <div className="application-actions">
                <a href={application.baseUrl} target="_blank" rel="noreferrer">打开 Base ↗</a>
                <a href={judgePath(application.id)} target="_blank" rel="noreferrer">打开公开评分台</a>
                <button onClick={() => void copyWorkshopLink(application)}>复制公开链接</button>
                <button disabled={busy} onClick={() => void loadJudgeLinks(application)}>生成评委个人链接</button>
                <button disabled={busy} onClick={() => void loadRubric(application)}>配置评分标准</button>
                <button disabled={busy || editingId === application.id} onClick={() => { setEditingId(application.id); setEditingName(application.name); }}>修改 Base 名称</button>
              </div>
              {judgeLinkApplicationId === application.id && (
                <section className="judge-link-panel">
                  <header>
                    <div><strong>评委个人专属链接</strong><small>来自飞书“评委”表 · 30 天有效 · 停用评委后立即失效</small></div>
                    <button onClick={() => { setJudgeLinkApplicationId(""); setJudgeLinks([]); }}>收起</button>
                  </header>
                  {judgeLinks.length ? judgeLinks.map((judgeLink) => (
                    <div className="judge-link-row" key={judgeLink.id}>
                      <span>{judgeLink.seat}</span>
                      <strong>{judgeLink.name}</strong>
                      <button onClick={() => void copyPersonalJudgeLink(judgeLink)}>复制个人登录链接</button>
                    </div>
                  )) : <p>评委表中暂无启用评委。</p>}
                </section>
              )}
              {rubricApplicationId === application.id && (
                <section className="application-rubric-panel">
                  <header>
                    <div><strong>本工作坊评分标准</strong><small>{rubricLocked ? "已有评分，已锁定" : "直接写入飞书 Base"}</small></div>
                    <button onClick={() => setRubricApplicationId("")}>收起</button>
                  </header>
                  <fieldset className="template-picker" disabled={rubricLocked}>
                    <legend>套用模板</legend>
                    {(["personal", "team"] as ScoringTemplateId[]).map((item) => (
                      <button
                        className={rubricTemplateId === item ? "active" : ""}
                        type="button"
                        key={item}
                        disabled={rubricLocked}
                        onClick={() => chooseTemplate(item, setRubricTemplateId, setRubricCriteria)}
                      >{SCORING_TEMPLATES[item].name}</button>
                    ))}
                  </fieldset>
                  <CriteriaEditor criteria={rubricCriteria} disabled={rubricLocked} onChange={setRubricCriteria} />
                  {!rubricLocked && <button className="config-submit" disabled={busy} onClick={() => void saveRubric()}>保存到飞书评分标准表</button>}
                </section>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
