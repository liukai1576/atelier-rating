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

type ManagedJudge = {
  recordId: string;
  id: string;
  name: string;
  seat: string;
  enabled: boolean;
  url: string;
};

type AdminScreen = "list" | "create" | "detail";
type DetailTab = "overview" | "judges" | "rubric";

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
  const [judgeApplicationId, setJudgeApplicationId] = useState("");
  const [managedJudges, setManagedJudges] = useState<ManagedJudge[]>([]);
  const [judgeDrafts, setJudgeDrafts] = useState<Record<string, { name: string; seat: string }>>({});
  const [newJudgeName, setNewJudgeName] = useState("");
  const [newJudgeSeat, setNewJudgeSeat] = useState("");
  const [screen, setScreen] = useState<AdminScreen>("list");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
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
      if (payload.application) {
        setSelectedApplicationId(payload.application.id);
        setDetailTab("overview");
        setScreen("detail");
      }
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

  const applyJudgeList = (judges: ManagedJudge[]) => {
    setManagedJudges(judges);
    setJudgeDrafts(Object.fromEntries(judges.map((judge) => [judge.recordId, { name: judge.name, seat: judge.seat }])));
  };

  const loadJudges = async (application: RatingApplication) => {
    if (busy) return;
    setBusy(true);
    setMessage(`正在读取「${application.name}」的评委表…`);
    try {
      const response = await fetch(`/api/configurations/judges?appId=${encodeURIComponent(application.id)}`, {
        headers: { "x-atelier-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json() as { judges?: ManagedJudge[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "读取评委失败");
      setJudgeApplicationId(application.id);
      applyJudgeList(payload.judges ?? []);
      setMessage(payload.judges?.length ? "评委名单与专属链接已从飞书同步。" : "当前没有评委，可以直接在这里添加。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取评委失败");
    } finally {
      setBusy(false);
    }
  };

  const addJudge = async () => {
    if (!judgeApplicationId || !newJudgeName.trim() || busy) return;
    setBusy(true);
    setMessage("正在新增评委并写入飞书…");
    try {
      const response = await fetch("/api/configurations/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: judgeApplicationId, name: newJudgeName, seat: newJudgeSeat, adminKey }),
      });
      const payload = await response.json() as { saved?: boolean; judges?: ManagedJudge[]; message?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "新增评委失败");
      applyJudgeList(payload.judges ?? []);
      setNewJudgeName("");
      setNewJudgeSeat("");
      setMessage("评委已新增，个人专属链接已写入飞书评委表。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增评委失败");
    } finally {
      setBusy(false);
    }
  };

  const updateJudge = async (judge: ManagedJudge, patch: Record<string, unknown>, successMessage: string) => {
    if (!judgeApplicationId || busy) return;
    setBusy(true);
    setMessage("正在更新飞书评委表…");
    try {
      const response = await fetch("/api/configurations/judges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: judgeApplicationId, recordId: judge.recordId, adminKey, ...patch }),
      });
      const payload = await response.json() as { saved?: boolean; judges?: ManagedJudge[]; message?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.message || "更新评委失败");
      applyJudgeList(payload.judges ?? []);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新评委失败");
    } finally {
      setBusy(false);
    }
  };

  const copyPersonalJudgeLink = async (judge: ManagedJudge) => {
    await window.navigator.clipboard.writeText(judge.url);
    setMessage(`已复制「${judge.name}」的个人专属评分链接。`);
  };

  const openWorkshop = (application: RatingApplication, tab: DetailTab = "overview") => {
    setSelectedApplicationId(application.id);
    setDetailTab(tab);
    setScreen("detail");
    setEditingId("");
    setEditingName("");
    setMessage("");
    if (tab === "judges") void loadJudges(application);
    if (tab === "rubric") void loadRubric(application);
  };

  const selectDetailTab = (application: RatingApplication, tab: DetailTab) => {
    setDetailTab(tab);
    setMessage("");
    if (tab === "judges" && judgeApplicationId !== application.id) void loadJudges(application);
    if (tab === "rubric" && rubricApplicationId !== application.id) void loadRubric(application);
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

  const selectedApplication = applications.find((application) => application.id === selectedApplicationId);

  return (
    <main className="config-view admin-config-page" data-testid="configuration-center">
      <header className="admin-topbar">
        <button className="admin-topbar-brand" onClick={() => { setScreen("list"); setMessage(""); }}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <span><strong>ATELIER</strong><small>工作坊管理</small></span>
        </button>
        <nav className="admin-primary-nav" aria-label="后台主导航">
          <button className={screen === "list" ? "active" : ""} onClick={() => { setScreen("list"); setMessage(""); }}>工作坊列表</button>
          <button className={screen === "create" ? "active" : ""} onClick={() => { setScreen("create"); setMessage(""); }}>新建工作坊</button>
        </nav>
        <div className="admin-header-actions">
          <button disabled={busy} onClick={() => {
            setBusy(true);
            setMessage("正在重新读取飞书配置…");
            void loadApplications(adminKey)
              .then(() => setMessage("配置已刷新。"))
              .catch((error) => setMessage(error instanceof Error ? error.message : "读取飞书配置失败"))
              .finally(() => setBusy(false));
          }}>刷新数据</button>
          <button onClick={() => {
            window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
            setAuthenticated(false);
            setAdminKey("");
          }}>退出</button>
        </div>
      </header>

      {message && <p className="config-message admin-global-message" role="status">{message}</p>}

      {screen === "list" && (
        <section className="admin-content admin-list-view">
          <header className="admin-screen-heading">
            <div><span className="eyebrow">WORKSHOPS</span><h1>工作坊列表</h1><p>一个工作坊对应一个飞书 Base。进入详情后再管理名称、评委和评分标准。</p></div>
            <button className="admin-primary-action" onClick={() => { setScreen("create"); setMessage(""); }}>新建工作坊</button>
          </header>
          <div className="workshop-list-card">
            <div className="workshop-list-header"><span>工作坊</span><span>数据连接</span><span>状态</span><span>操作</span></div>
            {applications.length ? applications.map((application) => (
              <article className="workshop-list-row" key={application.id}>
                <div className="workshop-list-name"><strong>{application.name}</strong><small>{application.id}</small></div>
                <div className="workshop-list-meta"><span>飞书 Base</span><small>{application.projectsTableId ? "6 张业务表已连接" : "待检查数据表"}</small></div>
                <span className={`workshop-status ${application.enabled ? "enabled" : "disabled"}`}>{application.enabled ? "已开放" : "未开放"}</span>
                <div className="workshop-list-actions">
                  <button className="primary" onClick={() => openWorkshop(application)}>查看详情</button>
                  <a href={judgePath(application.id)} target="_blank" rel="noreferrer">评分台 ↗</a>
                  <a href={application.baseUrl} target="_blank" rel="noreferrer">Base ↗</a>
                </div>
              </article>
            )) : (
              <div className="admin-empty-state"><strong>还没有工作坊</strong><p>从标准模板复制一份飞书 Base，然后创建第一个工作坊。</p><button onClick={() => setScreen("create")}>新建工作坊</button></div>
            )}
          </div>
        </section>
      )}

      {screen === "create" && (
        <section className="admin-content admin-create-view">
          <button className="admin-back-button" onClick={() => { setScreen("list"); setMessage(""); }}>← 返回工作坊列表</button>
          <header className="admin-screen-heading"><div><span className="eyebrow">NEW WORKSHOP</span><h1>新建工作坊</h1><p>准备一份符合模板的飞书 Base，校验成功后即可加入系统。</p></div></header>
        <form className="config-form" onSubmit={(event) => {
          event.preventDefault();
          void saveConfiguration();
        }}>
          <div className="config-step"><span>01</span><div><strong>复制模板</strong><p>一个工作坊复制一份标准 Base，再填写参评项目和项目组；评分表保持空白。</p></div></div>
          <div className="config-step"><span>02</span><div><strong>接入工作坊</strong><p>填写工作坊名称并粘贴 Base 链接；接入后进入工作坊详情管理评委。</p></div></div>
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
        </form>
        </section>
      )}

      {screen === "detail" && selectedApplication && (
        <section className="admin-content admin-detail-view">
          <button className="admin-back-button" onClick={() => { setScreen("list"); setMessage(""); }}>← 返回工作坊列表</button>
          <header className="admin-detail-hero">
            <div><span className="eyebrow">WORKSHOP DETAIL</span><h1>{selectedApplication.name}</h1><p>{selectedApplication.id}</p></div>
            <div className="admin-detail-hero-actions">
              <button onClick={() => void copyWorkshopLink(selectedApplication)}>复制评分台链接</button>
              <a href={judgePath(selectedApplication.id)} target="_blank" rel="noreferrer">打开评分台 ↗</a>
              <a href={selectedApplication.baseUrl} target="_blank" rel="noreferrer">打开 Base ↗</a>
            </div>
          </header>
          <nav className="admin-detail-tabs" aria-label="工作坊详情导航">
            <button className={detailTab === "overview" ? "active" : ""} onClick={() => selectDetailTab(selectedApplication, "overview")}>概览</button>
            <button className={detailTab === "judges" ? "active" : ""} onClick={() => selectDetailTab(selectedApplication, "judges")}>评委管理</button>
            <button className={detailTab === "rubric" ? "active" : ""} onClick={() => selectDetailTab(selectedApplication, "rubric")}>评分标准</button>
          </nav>

          {detailTab === "overview" && (
            <div className="admin-detail-panel">
              <section className="admin-overview-grid">
                <article><small>连接状态</small><strong>{selectedApplication.enabled ? "已开放" : "未开放"}</strong><p>评分台按工作坊专属链接访问。</p></article>
                <article><small>飞书 Base</small><strong>业务数据源</strong><p>项目、评委、评分与配置均以此 Base 为准。</p></article>
                <article><small>数据表</small><strong>6 张已连接</strong><p>工作坊、评分标准、参评项目、评分、评委、项目组。</p></article>
              </section>
              <section className="admin-management-card">
                <header><div><h2>基本信息</h2><p>工作坊名称会同步修改飞书 Base 文件名，专属链接保持不变。</p></div></header>
                {editingId === selectedApplication.id ? (
                  <div className="application-name-editor">
                    <input aria-label="工作坊名称" value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                    <button disabled={busy || !editingName.trim()} onClick={() => void renameApplication(selectedApplication)}>保存名称</button>
                    <button disabled={busy} onClick={() => { setEditingId(""); setEditingName(""); }}>取消</button>
                  </div>
                ) : (
                  <div className="admin-name-row"><div><small>工作坊名称</small><strong>{selectedApplication.name}</strong></div><button disabled={busy} onClick={() => { setEditingId(selectedApplication.id); setEditingName(selectedApplication.name); }}>修改名称</button></div>
                )}
                <dl className="admin-table-identifiers">
                  <div><dt>工作坊表</dt><dd>{selectedApplication.workshopsTableId || "未配置"}</dd></div>
                  <div><dt>评分标准表</dt><dd>{selectedApplication.rubricsTableId || "未配置"}</dd></div>
                  <div><dt>参评项目表</dt><dd>{selectedApplication.projectsTableId || "未配置"}</dd></div>
                  <div><dt>评分表</dt><dd>{selectedApplication.scoresTableId || "未配置"}</dd></div>
                  <div><dt>评委表</dt><dd>{selectedApplication.judgesTableId || "未配置"}</dd></div>
                  <div><dt>项目组表</dt><dd>{selectedApplication.teamsTableId || "未配置"}</dd></div>
                </dl>
              </section>
            </div>
          )}

          {detailTab === "judges" && (
            <div className="admin-detail-panel">
              <section className="judge-link-panel">
                  <header>
                    <div><strong>评委管理</strong><small>新增、修改及专属链接都会直接写入飞书“评委”表</small></div>
                    <button disabled={busy} onClick={() => void loadJudges(selectedApplication)}>重新同步</button>
                  </header>
                  <form className="judge-create-row" onSubmit={(event) => { event.preventDefault(); void addJudge(); }}>
                    <input aria-label="新评委姓名" placeholder="评委姓名" value={newJudgeName} onChange={(event) => setNewJudgeName(event.target.value)} />
                    <input aria-label="新评委座位号" placeholder="座位号（可选）" value={newJudgeSeat} onChange={(event) => setNewJudgeSeat(event.target.value)} />
                    <button disabled={busy || !newJudgeName.trim()}>新增评委</button>
                  </form>
                  {managedJudges.length ? managedJudges.map((managedJudge) => (
                    <div className={`judge-link-row ${managedJudge.enabled ? "" : "disabled"}`} key={managedJudge.recordId}>
                      <input
                        aria-label={`${managedJudge.name}姓名`}
                        value={judgeDrafts[managedJudge.recordId]?.name ?? managedJudge.name}
                        onChange={(event) => setJudgeDrafts((current) => ({
                          ...current,
                          [managedJudge.recordId]: { name: event.target.value, seat: current[managedJudge.recordId]?.seat ?? managedJudge.seat },
                        }))}
                      />
                      <input
                        aria-label={`${managedJudge.name}座位号`}
                        placeholder="座位号"
                        value={judgeDrafts[managedJudge.recordId]?.seat ?? managedJudge.seat}
                        onChange={(event) => setJudgeDrafts((current) => ({
                          ...current,
                          [managedJudge.recordId]: { name: current[managedJudge.recordId]?.name ?? managedJudge.name, seat: event.target.value },
                        }))}
                      />
                      <div className="judge-link-actions">
                        <button disabled={busy} onClick={() => void updateJudge(managedJudge, judgeDrafts[managedJudge.recordId] ?? {}, "评委姓名和座位号已写入飞书。")}>保存</button>
                        <button disabled={busy} onClick={() => void copyPersonalJudgeLink(managedJudge)}>复制专属链接</button>
                        <button disabled={busy} onClick={() => void updateJudge(managedJudge, { rotate: true }, "已生成新链接并写入飞书，旧链接与旧会话已失效。")}>重置链接</button>
                        <button disabled={busy} onClick={() => void updateJudge(managedJudge, { enabled: !managedJudge.enabled }, managedJudge.enabled ? "评委已停用，专属链接立即失效。" : "评委已重新启用。")}>{managedJudge.enabled ? "停用" : "启用"}</button>
                      </div>
                    </div>
                  )) : <p>尚未添加评委。</p>}
              </section>
            </div>
          )}

          {detailTab === "rubric" && (
            <div className="admin-detail-panel">
              <section className="application-rubric-panel">
                  <header>
                    <div><strong>本工作坊评分标准</strong><small>{rubricLocked ? "已有评分，已锁定" : "直接写入飞书 Base"}</small></div>
                    <button disabled={busy} onClick={() => void loadRubric(selectedApplication)}>重新同步</button>
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
            </div>
          )}
        </section>
      )}

      {screen === "detail" && !selectedApplication && (
        <section className="admin-content admin-empty-state"><strong>工作坊不存在</strong><p>该工作坊可能已被移除，请返回列表重新选择。</p><button onClick={() => setScreen("list")}>返回工作坊列表</button></section>
      )}
    </main>
  );
}
