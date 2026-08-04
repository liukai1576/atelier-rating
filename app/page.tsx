"use client";

import { useEffect, useMemo, useState } from "react";

type View = "judge" | "admin" | "awards";
type Tone = "low" | "mid" | "high";

type Rubric = {
  range: string;
  title: string;
  text: string;
  tone: Tone;
};

type Criterion = {
  id: string;
  name: string;
  shortName: string;
  weight: number;
  description: string;
  rubrics: Rubric[];
};

type Project = {
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
};

type Workshop = {
  id: string;
  name: string;
  code: string;
  date: string;
  location: string;
  nominationName: string;
  nominationLimit: number;
  projects: Project[];
};

type ScoreCard = {
  scores: Record<string, number>;
  nomination: boolean | null;
  note: string;
};

type Submission = ScoreCard & {
  submittedAt: string;
  locked: boolean;
  judgeName: string;
  recordId?: string;
};

type AppStore = {
  channelLocked: Record<string, boolean>;
  drafts: Record<string, Record<string, Record<string, ScoreCard>>>;
  submissions: Record<
    string,
    Record<string, Record<string, Submission>>
  >;
};

const criteria: Criterion[] = [
  {
    id: "problem",
    name: "问题定义",
    shortName: "问题",
    weight: 15,
    description: "是否抓住真实、重要且值得解决的问题，并给出清晰边界。",
    rubrics: [
      { range: "0–3", title: "问题模糊", text: "问题来自假设，目标人群与场景不清晰。", tone: "low" },
      { range: "4–7", title: "问题成立", text: "有真实场景支撑，影响范围与痛点基本明确。", tone: "mid" },
      { range: "8–10", title: "洞察深刻", text: "抓住关键矛盾，有证据且问题边界高度清晰。", tone: "high" },
    ],
  },
  {
    id: "value",
    name: "用户与业务价值",
    shortName: "价值",
    weight: 20,
    description: "方案带来的用户改善、业务收益与价值验证是否充分。",
    rubrics: [
      { range: "0–3", title: "价值有限", text: "收益描述抽象，缺少量化依据。", tone: "low" },
      { range: "4–7", title: "价值明确", text: "能改善核心体验或关键业务指标。", tone: "mid" },
      { range: "8–10", title: "价值显著", text: "价值链路完整，收益可信且可被验证。", tone: "high" },
    ],
  },
  {
    id: "innovation",
    name: "方案创新性",
    shortName: "创新",
    weight: 20,
    description: "解题思路、技术组合与体验机制是否形成差异化突破。",
    rubrics: [
      { range: "0–3", title: "常规组合", text: "主要复用成熟做法，差异化较弱。", tone: "low" },
      { range: "4–7", title: "局部创新", text: "在关键环节提出有价值的新方法。", tone: "mid" },
      { range: "8–10", title: "突破创新", text: "重新定义流程或体验，优势难以替代。", tone: "high" },
    ],
  },
  {
    id: "feasibility",
    name: "可行性与完成度",
    shortName: "可行性",
    weight: 15,
    description: "方案是否能落地，原型、数据与关键风险是否得到验证。",
    rubrics: [
      { range: "0–3", title: "概念阶段", text: "关键假设尚未验证，落地路径不清。", tone: "low" },
      { range: "4–7", title: "基本可行", text: "核心链路已验证，仍有少量关键风险。", tone: "mid" },
      { range: "8–10", title: "落地就绪", text: "关键能力完整，资源、风险和计划清晰。", tone: "high" },
    ],
  },
  {
    id: "impact",
    name: "影响力与可推广性",
    shortName: "影响",
    weight: 20,
    description: "方案的覆盖规模、迁移能力与长期组织价值。",
    rubrics: [
      { range: "0–3", title: "单点应用", text: "只适用于单一小场景，复用空间有限。", tone: "low" },
      { range: "4–7", title: "多场景复用", text: "可迁移到相邻团队或类似流程。", tone: "mid" },
      { range: "8–10", title: "规模化价值", text: "具备平台化潜力，可形成组织级能力。", tone: "high" },
    ],
  },
  {
    id: "presentation",
    name: "表达与答辩",
    shortName: "表达",
    weight: 10,
    description: "叙事是否清晰，证据是否可信，现场问答是否准确有力。",
    rubrics: [
      { range: "0–3", title: "表达不清", text: "结构松散，关键问题未能有效回答。", tone: "low" },
      { range: "4–7", title: "清晰完整", text: "逻辑完整，重点明确，回答基本准确。", tone: "mid" },
      { range: "8–10", title: "专业有力", text: "叙事简洁可信，问答体现深入思考。", tone: "high" },
    ],
  },
];

const projectSeeds = [
  ["灯塔计划", "向光而行", "AI × 学习", "让新人在第一周找到正确的人、文档和行动路径。", "把散落在知识库、群聊和制度文档里的信息组合成一位可追问、能给出处的入职向导。"],
  ["巡检一号", "可靠交付组", "AI × 运营", "把每日两小时的数据巡检缩短到十分钟。", "自动汇总异常、解释波动并生成待办，保留人工复核与完整审计链路。"],
  ["回声教练", "体验增长组", "AI × 服务", "把每一次客户对话变成下一次服务改进。", "从对话中识别用户意图、情绪与关键阻塞，生成可执行的教练建议。"],
  ["零点工作室", "产品孵化营", "AI × 创作", "从模糊想法到可测试原型，只需要一个下午。", "用结构化问题帮助团队完成需求澄清、原型生成与用户测试脚本设计。"],
  ["智检方舟", "质量共创队", "AI × 质控", "在文件交付前发现那些最贵的错误。", "结合规则与语义理解检查合同、报告和投放素材，并给出可追溯的修改建议。"],
  ["脉冲看板", "增长实验室", "数据智能", "让团队先看见变化，再理解变化。", "把多源指标归并为事件流，自动定位异常与可能原因，支持一键下钻。"],
  ["同路人", "组织体验组", "协作创新", "让跨部门项目不再卡在“我以为”。", "用角色契约、决策记录和风险雷达减少信息差，帮助团队快速形成共识。"],
  ["绿色里程", "可持续行动队", "ESG 创新", "把每个小选择换算成看得见的环境价值。", "通过轻量记录和可信口径呈现减排效果，并给出更可行的下一步建议。"],
];

function makeProjects(prefix: string, count: number): Project[] {
  return projectSeeds.slice(0, count).map((seed, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    name: seed[0],
    team: seed[1],
    track: seed[2],
    summary: seed[3],
    description: seed[4],
    duration: index % 2 === 0 ? "8 分钟路演 · 4 分钟问答" : "10 分钟路演 · 5 分钟问答",
  }));
}

const demoWorkshops: Workshop[] = [
  {
    id: "product-lab",
    name: "产品创新工作坊 · 秋季场",
    code: "WS–024",
    date: "2026.09.18",
    location: "上海 · 共创大厅",
    nominationName: "最具启发奖",
    nominationLimit: 2,
    projects: makeProjects("PL", 8),
  },
  {
    id: "ai-camp",
    name: "AI 应用共创营 · 华东场",
    code: "WS–031",
    date: "2026.10.12",
    location: "杭州 · 未来中心",
    nominationName: "最佳实践奖",
    nominationLimit: 2,
    projects: makeProjects("AI", 6),
  },
  {
    id: "cx-sprint",
    name: "客户体验设计赛 · 决选",
    code: "WS–036",
    date: "2026.11.07",
    location: "深圳 · 城市客厅",
    nominationName: "体验突破奖",
    nominationLimit: 3,
    projects: makeProjects("CX", 7),
  },
];

const demoJudges = [
  { id: "judge-01", name: "李晓岚", seat: "A01" },
  { id: "judge-02", name: "周   扬", seat: "A02" },
  { id: "judge-03", name: "陈   默", seat: "A03" },
  { id: "judge-04", name: "王若溪", seat: "A04" },
  { id: "judge-05", name: "赵   谦", seat: "A05" },
  { id: "judge-06", name: "许知远", seat: "A06" },
];

const STORAGE_KEY = "atelier-workshop-score-desk-v1";

function weightedTotal(scores: Record<string, number>) {
  return criteria.reduce(
    (sum, criterion) =>
      sum + (typeof scores[criterion.id] === "number"
        ? scores[criterion.id] * criterion.weight / 100
        : 0),
    0,
  );
}

function scoreCount(scores: Record<string, number>) {
  return criteria.filter((criterion) => typeof scores[criterion.id] === "number").length;
}

function seededSubmission(
  workshopIndex: number,
  judgeIndex: number,
  projectIndex: number,
  judgeName: string,
): Submission {
  const scores = Object.fromEntries(
    criteria.map((criterion, criterionIndex) => [
      criterion.id,
      Math.min(10, 6 + ((workshopIndex + judgeIndex * 2 + projectIndex * 3 + criterionIndex) % 5)),
    ]),
  );
  return {
    scores,
    nomination: (projectIndex + judgeIndex) % 4 === 0,
    note: "",
    submittedAt: `2026-07-28T${String(9 + judgeIndex).padStart(2, "0")}:${String(projectIndex * 7).padStart(2, "0")}:00.000Z`,
    locked: false,
    judgeName,
  };
}

function createDefaultStore(fillAll = false): AppStore {
  const submissions: AppStore["submissions"] = {};
  for (let workshopIndex = 0; workshopIndex < demoWorkshops.length; workshopIndex += 1) {
    const workshop = demoWorkshops[workshopIndex];
    submissions[workshop.id] = {};
    for (let judgeIndex = 1; judgeIndex < demoJudges.length; judgeIndex += 1) {
      const judge = demoJudges[judgeIndex];
      submissions[workshop.id][judge.id] = {};
      const normalLimit = Math.max(1, workshop.projects.length - (judgeIndex % 3));
      const limit = fillAll ? workshop.projects.length : normalLimit;
      for (let projectIndex = 0; projectIndex < limit; projectIndex += 1) {
        const project = workshop.projects[projectIndex];
        submissions[workshop.id][judge.id][project.id] = seededSubmission(
          workshopIndex,
          judgeIndex,
          projectIndex,
          judge.name,
        );
      }
    }
  }
  return {
    channelLocked: Object.fromEntries(demoWorkshops.map((workshop) => [workshop.id, false])),
    drafts: {},
    submissions,
  };
}

function emptyScoreCard(): ScoreCard {
  return { scores: {}, nomination: null, note: "" };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatDate(value?: string) {
  if (!value) return "尚未提交";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function rubricIndex(criterion: Criterion, score?: number) {
  if (typeof score !== "number") return -1;
  if (score <= 3) return 0;
  if (score <= 7) return 1;
  return 2;
}

export default function Home() {
  const [store, setStore] = useState<AppStore>(() => createDefaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [workshopsData, setWorkshopsData] = useState<Workshop[]>(demoWorkshops);
  const [judgesData, setJudgesData] = useState(demoJudges);
  const [dataMode, setDataMode] = useState<"loading" | "demo" | "bitable" | "error">("loading");
  const [dataMessage, setDataMessage] = useState("正在连接飞书多维表格…");
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<View>("judge");
  const [activeWorkshopId, setActiveWorkshopId] = useState(demoWorkshops[0].id);
  const [judgeId, setJudgeId] = useState(demoJudges[0].id);
  const [projectId, setProjectId] = useState(demoWorkshops[0].projects[0].id);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [awardIndex, setAwardIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);

  const workshop = workshopsData.find((item) => item.id === activeWorkshopId) ?? workshopsData[0];
  const judge = judgesData.find((item) => item.id === judgeId) ?? judgesData[0];
  const workshopSubmissions = useMemo(
    () => store.submissions[workshop.id] ?? {},
    [store.submissions, workshop.id],
  );
  const judgeSubmissions = workshopSubmissions[judge.id] ?? {};
  const project = workshop.projects.find((item) => item.id === projectId)
    ?? workshop.projects.find((item) => !judgeSubmissions[item.id])
    ?? workshop.projects[0];
  const submission = judgeSubmissions[project.id];
  const storedDraft = store.drafts[workshop.id]?.[judge.id]?.[project.id];
  const draft = storedDraft ?? (submission
    ? { scores: submission.scores, nomination: submission.nomination, note: submission.note }
    : emptyScoreCard());
  const channelLocked = store.channelLocked[workshop.id] ?? false;
  const ballotLocked = Object.values(judgeSubmissions).some((item) => item.locked);
  const editingLocked = channelLocked || ballotLocked;
  const completedCount = Object.keys(judgeSubmissions).length;
  const total = weightedTotal(draft.scores);
  const dimensionsDone = scoreCount(draft.scores);
  const canSubmit = !editingLocked && dimensionsDone === criteria.length;
  const nominatedIds = new Set(
    workshop.projects
      .filter((item) => {
        const localDraft = store.drafts[workshop.id]?.[judge.id]?.[item.id];
        const saved = judgeSubmissions[item.id];
        return (localDraft?.nomination ?? saved?.nomination) === true;
      })
      .map((item) => item.id),
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      let localStore = createDefaultStore();
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) localStore = JSON.parse(saved) as AppStore;
      } catch {
        // A corrupt local demo state should not prevent the scoring desk from loading.
      }

      try {
        const response = await fetch("/api/bitable/bootstrap", { cache: "no-store" });
        const payload = await response.json() as {
          connected: boolean;
          message: string;
          workshops?: Workshop[];
          judges?: typeof demoJudges;
          submissions?: AppStore["submissions"];
        };
        if (cancelled) return;
        if (response.ok && payload.connected && payload.workshops?.length) {
          const nextWorkshops = payload.workshops;
          const nextJudges = payload.judges?.length ? payload.judges : demoJudges;
          setWorkshopsData(nextWorkshops);
          setJudgesData(nextJudges);
          setActiveWorkshopId(nextWorkshops[0].id);
          setProjectId(nextWorkshops[0].projects[0].id);
          setJudgeId(nextJudges[0].id);
          setStore({
            channelLocked: {
              ...Object.fromEntries(nextWorkshops.map((item) => [item.id, false])),
              ...localStore.channelLocked,
            },
            drafts: localStore.drafts,
            submissions: payload.submissions ?? {},
          });
          setDataMode("bitable");
          setDataMessage(payload.message);
        } else {
          setStore(localStore);
          setDataMode(response.ok ? "demo" : "error");
          setDataMessage(payload.message || "多维表格连接失败，当前使用本地演示数据。");
        }
      } catch {
        if (cancelled) return;
        setStore(localStore);
        setDataMode("error");
        setDataMessage("多维表格连接失败，当前使用本地演示数据。");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!presenting) return;
    const exitWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresenting(false);
    };
    window.addEventListener("keydown", exitWithEscape);
    return () => window.removeEventListener("keydown", exitWithEscape);
  }, [presenting]);

  const visibleProjects = workshop.projects.filter((item) => {
    const query = search.trim().toLowerCase();
    const textMatches = `${item.name} ${item.team} ${item.summary}`.toLowerCase().includes(query);
    const statusMatches = !pendingOnly || !judgeSubmissions[item.id] || item.id === project.id;
    return textMatches && statusMatches;
  });

  const ranking = useMemo(() => {
    return workshop.projects
      .map((item) => {
        const entries = judgesData
          .map((person) => workshopSubmissions[person.id]?.[item.id])
          .filter(Boolean) as Submission[];
        const totals = entries.map((entry) => weightedTotal(entry.scores));
        const criterionAverage = (criterionId: string) =>
          entries.length
            ? entries.reduce((sum, entry) => sum + (entry.scores[criterionId] ?? 0), 0) / entries.length
            : 0;
        return {
          project: item,
          count: entries.length,
          average: totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0,
          highest: totals.length ? Math.max(...totals) : 0,
          lowest: totals.length ? Math.min(...totals) : 0,
          nominations: entries.filter((entry) => entry.nomination).length,
          innovation: criterionAverage("innovation"),
          value: criterionAverage("value"),
        };
      })
      .sort((left, right) =>
        Number(Boolean(right.count)) - Number(Boolean(left.count))
        || right.average - left.average
        || right.innovation - left.innovation
        || right.value - left.value
        || left.project.id.localeCompare(right.project.id),
      );
  }, [workshop, workshopSubmissions, judgesData]);

  const participatingJudges = judgesData.filter((person) =>
    Object.keys(workshopSubmissions[person.id] ?? {}).length > 0,
  );
  const adminJudgeList = participatingJudges.length ? participatingJudges : judgesData;
  const totalTasks = adminJudgeList.length * workshop.projects.length;
  const submittedTasks = adminJudgeList.reduce(
    (sum, person) => sum + Object.keys(workshopSubmissions[person.id] ?? {}).length,
    0,
  );
  const fullyScoredProjects = workshop.projects.filter((item) =>
    adminJudgeList.every((person) => workshopSubmissions[person.id]?.[item.id]),
  ).length;

  const mutateDraft = (mutator: (value: ScoreCard) => ScoreCard) => {
    if (editingLocked) return;
    setStore((previous) => {
      const next = clone(previous);
      next.drafts[workshop.id] ??= {};
      next.drafts[workshop.id][judge.id] ??= {};
      const current = next.drafts[workshop.id][judge.id][project.id]
        ?? (submission
          ? { scores: clone(submission.scores), nomination: submission.nomination, note: submission.note }
          : emptyScoreCard());
      next.drafts[workshop.id][judge.id][project.id] = mutator(current);
      return next;
    });
  };

  const updateScore = (criterionId: string, value: number) => {
    const score = Math.max(0, Math.min(10, Math.round(value * 1000) / 1000));
    mutateDraft((current) => ({
      ...current,
      scores: { ...current.scores, [criterionId]: score },
    }));
  };

  const nextPendingProject = () => {
    const start = workshop.projects.findIndex((item) => item.id === project.id);
    for (let step = 1; step < workshop.projects.length; step += 1) {
      const candidate = workshop.projects[(start + step) % workshop.projects.length];
      if (!judgeSubmissions[candidate.id]) return candidate;
    }
    return null;
  };

  const confirmSubmit = async () => {
    if (!canSubmit || syncing) return;
    const nextProject = nextPendingProject();
    let submittedAt = new Date().toISOString();
    let recordId = submission?.recordId;
    if (dataMode === "bitable") {
      setSyncing(true);
      try {
        const response = await fetch("/api/bitable/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workshop: { id: workshop.id, name: workshop.name },
            project: { id: project.id, name: project.name, team: project.team },
            judge: { id: judge.id, name: judge.name },
            scoreCard: draft,
            weightedTotal: total,
          }),
        });
        const payload = await response.json() as {
          saved: boolean;
          message?: string;
          recordId?: string;
          submittedAt?: string;
        };
        if (!response.ok || !payload.saved) {
          throw new Error(payload.message || "飞书多维表格写入失败");
        }
        submittedAt = payload.submittedAt ?? submittedAt;
        recordId = payload.recordId;
      } catch (error) {
        setToast(error instanceof Error ? error.message : "飞书多维表格写入失败");
        setSyncing(false);
        return;
      }
      setSyncing(false);
    }
    setStore((previous) => {
      const next = clone(previous);
      next.submissions[workshop.id] ??= {};
      next.submissions[workshop.id][judge.id] ??= {};
      next.submissions[workshop.id][judge.id][project.id] = {
        ...clone(draft),
        submittedAt,
        locked: false,
        judgeName: judge.name,
        recordId,
      };
      return next;
    });
    setConfirmOpen(false);
    if (nextProject) setProjectId(nextProject.id);
    const destination = dataMode === "bitable" ? "并写入多维表格" : "到本设备";
    setToast(nextProject
      ? `已保存「${project.name}」${destination}，进入下一待评项目`
      : `已保存「${project.name}」${destination}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearDraft = () => {
    if (editingLocked || !window.confirm(`清空「${project.name}」的当前评分草稿？`)) return;
    setStore((previous) => {
      const next = clone(previous);
      next.drafts[workshop.id] ??= {};
      next.drafts[workshop.id][judge.id] ??= {};
      next.drafts[workshop.id][judge.id][project.id] = emptyScoreCard();
      return next;
    });
    setToast("当前项目草稿已清空");
  };

  const lockBallot = () => {
    if (completedCount < workshop.projects.length || ballotLocked || syncing) return;
    setLockConfirmOpen(true);
  };

  const confirmLockBallot = async () => {
    if (dataMode === "bitable") {
      setSyncing(true);
      try {
        const response = await fetch("/api/bitable/scores", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workshopId: workshop.id, judgeId: judge.id }),
        });
        const payload = await response.json() as { locked: boolean; message?: string };
        if (!response.ok || !payload.locked) throw new Error(payload.message || "飞书锁票失败");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "飞书锁票失败");
        setSyncing(false);
        return;
      }
      setSyncing(false);
    }
    setStore((previous) => {
      const next = clone(previous);
      Object.values(next.submissions[workshop.id]?.[judge.id] ?? {}).forEach((item) => {
        item.locked = true;
      });
      return next;
    });
    setLockConfirmOpen(false);
    setToast(dataMode === "bitable" ? "已锁票并同步到多维表格" : "已锁票，全部评分已最终提交");
  };

  const toggleChannel = () => {
    setStore((previous) => ({
      ...previous,
      channelLocked: {
        ...previous.channelLocked,
        [workshop.id]: !channelLocked,
      },
    }));
    setToast(channelLocked ? "评分通道已重新开放" : "评分通道已关闭");
  };

  const fillDemoData = () => {
    if (!window.confirm("为当前工作坊填满演示评分？现有本地评分会被演示数据覆盖。")) return;
    setStore((previous) => {
      const next = clone(previous);
      const workshopIndex = workshopsData.findIndex((item) => item.id === workshop.id);
      next.submissions[workshop.id] = {};
      judgesData.forEach((person, judgeIndex) => {
        next.submissions[workshop.id][person.id] = {};
        workshop.projects.forEach((item, projectIndex) => {
          next.submissions[workshop.id][person.id][item.id] = seededSubmission(
            workshopIndex,
            judgeIndex,
            projectIndex,
            person.name,
          );
        });
      });
      return next;
    });
    setToast("演示数据已填满");
  };

  const resetWorkshop = () => {
    if (!window.confirm("清空当前工作坊在本设备上的全部评分、提名与草稿？此操作不可撤销。")) return;
    setStore((previous) => {
      const next = clone(previous);
      next.submissions[workshop.id] = {};
      next.drafts[workshop.id] = {};
      next.channelLocked[workshop.id] = false;
      return next;
    });
    setProjectId(workshop.projects[0].id);
    setToast("当前工作坊数据已重置");
  };

  const exportCsv = () => {
    const rows = [[
      "工作坊",
      "项目",
      "团队",
      "评委",
      ...criteria.map((item) => `${item.name}(${item.weight}%)`),
      "加权总分",
      workshop.nominationName,
      "提交时间",
    ]];
    judgesData.forEach((person) => {
      workshop.projects.forEach((item) => {
        const entry = workshopSubmissions[person.id]?.[item.id];
        if (!entry) return;
        rows.push([
          workshop.name,
          item.name,
          item.team,
          person.name,
          ...criteria.map((criterion) => String(entry.scores[criterion.id] ?? "")),
          weightedTotal(entry.scores).toFixed(3),
          entry.nomination ? "是" : "否",
          entry.submittedAt,
        ]);
      });
    });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workshop.name}-评分明细.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setToast("评分明细已导出");
  };

  const resultsReady = totalTasks > 0 && submittedTasks === totalTasks;
  const bestPractice = resultsReady
    ? [...ranking].sort(
      (left, right) =>
        right.nominations - left.nominations
        || right.average - left.average
        || left.project.id.localeCompare(right.project.id),
    )[0]
    : undefined;
  const scoredRanking = resultsReady
    ? ranking.filter((item) => item.count === adminJudgeList.length)
    : [];
  const awards = [
    {
      label: workshop.nominationName,
      eyebrow: "JUDGES’ CHOICE",
      winner: bestPractice?.nominations ? bestPractice : undefined,
      metric: bestPractice?.nominations ? `${bestPractice.nominations} 票` : "待揭晓",
      note: "按评委提名票数产生",
    },
    {
      label: "三等奖",
      eyebrow: "THIRD PRIZE",
      winner: scoredRanking[2],
      metric: scoredRanking[2] ? scoredRanking[2].average.toFixed(2) : "待揭晓",
      note: "综合得分第三名",
    },
    {
      label: "二等奖",
      eyebrow: "SECOND PRIZE",
      winner: scoredRanking[1],
      metric: scoredRanking[1] ? scoredRanking[1].average.toFixed(2) : "待揭晓",
      note: "综合得分第二名",
    },
    {
      label: "一等奖",
      eyebrow: "FIRST PRIZE",
      winner: scoredRanking[0],
      metric: scoredRanking[0] ? scoredRanking[0].average.toFixed(2) : "待揭晓",
      note: "综合得分第一名",
    },
  ];

  return (
    <main className={`app-shell ${presenting ? "is-presenting" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <strong>ATELIER</strong>
            <small>Workshop Score Desk</small>
          </div>
        </div>
        <div className="workshop-switcher">
          <span>当前工作坊</span>
          <select
            value={workshop.id}
            onChange={(event) => setActiveWorkshopId(event.target.value)}
            aria-label="切换工作坊"
          >
            {workshopsData.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
          <small title={dataMessage}>
            {workshop.code} · {workshop.date} · {
              dataMode === "bitable"
                ? "多维表格已连接"
                : dataMode === "loading"
                  ? "正在连接数据"
                  : "本地演示数据"
            }
          </small>
        </div>
        <nav className="view-nav" aria-label="系统视图">
          <button className={view === "judge" ? "active" : ""} onClick={() => setView("judge")}>评委打分</button>
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>管理总览</button>
          <button className={view === "awards" ? "active" : ""} onClick={() => setView("awards")}>颁奖台</button>
        </nav>
        <div className={`channel-pill ${channelLocked ? "locked" : ""}`}>
          <i aria-hidden="true" />
          {channelLocked ? "通道已关闭" : "评分进行中"}
        </div>
      </header>

      {view === "judge" && (
        <section className="judge-layout">
          <aside className="project-rail">
            <div className="rail-heading">
              <div>
                <span className="eyebrow">PROJECT QUEUE</span>
                <h2>待评项目</h2>
              </div>
              <strong>{completedCount}/{workshop.projects.length}</strong>
            </div>
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="搜索项目或团队"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              className={`pending-filter ${pendingOnly ? "active" : ""}`}
              onClick={() => setPendingOnly((value) => !value)}
            >
              {pendingOnly ? "显示全部项目" : "仅看待评项目"}
            </button>
            <div className="project-list">
              {visibleProjects.map((item) => {
                const done = Boolean(judgeSubmissions[item.id]);
                const projectPosition = workshop.projects.findIndex((projectItem) => projectItem.id === item.id);
                return (
                  <button
                    key={item.id}
                    className={`${item.id === project.id ? "current" : ""} ${done ? "done" : ""}`}
                    onClick={() => {
                      setProjectId(item.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span>{String(projectPosition + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.team}</small>
                    </div>
                    <em>{ballotLocked && done ? "已锁票" : done ? "已保存" : item.id === project.id ? "评分中" : "待评分"}</em>
                  </button>
                );
              })}
              {!visibleProjects.length && <p className="empty-list">没有匹配的项目</p>}
            </div>
            <div className="rail-legend">
              <span><i className="done-dot" />已保存</span>
              <span><i className="current-dot" />当前</span>
              <span><i />待评</span>
            </div>
          </aside>

          <section className="mobile-project-strip" aria-label="移动端项目切换">
            {workshop.projects.map((item, index) => (
              <button
                key={item.id}
                className={`${item.id === project.id ? "current" : ""} ${judgeSubmissions[item.id] ? "done" : ""}`}
                onClick={() => setProjectId(item.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>{item.name}
              </button>
            ))}
          </section>

          <section className="score-workspace">
            <article className="project-brief">
              <div className="project-poster" aria-hidden="true">
                <span>{project.track}</span>
                <strong>{String(workshop.projects.findIndex((item) => item.id === project.id) + 1).padStart(2, "0")}</strong>
                <i />
              </div>
              <div className="project-copy">
                <div className="project-title-row">
                  <div>
                    <span className="eyebrow">CURRENT PROJECT · {project.team}</span>
                    <h1>{project.name}</h1>
                  </div>
                  <span className={`review-state ${editingLocked ? "locked" : submission ? "saved" : ""}`}>
                    {ballotLocked ? "已锁票 · 不可修改" : channelLocked ? "评分已暂停" : submission ? "已保存 · 可修改" : "当前评分中"}
                  </span>
                </div>
                <h3>{project.summary}</h3>
                {project.description.startsWith("http") ? (
                  <p><a className="project-material-link" href={project.description} target="_blank" rel="noreferrer">查看项目资料 ↗</a></p>
                ) : (
                  <p>{project.description}</p>
                )}
                {(project.teamOwner || project.teamMembers || project.teamDescription || project.teamMaterialsUrl) && (
                  <div className="team-profile" data-testid="team-profile">
                    <strong>{project.team}</strong>
                    {project.teamDescription && <span>{project.teamDescription}</span>}
                    <small>
                      {project.teamOwner && <>负责人：{project.teamOwner}</>}
                      {project.teamOwner && project.teamMembers && <> · </>}
                      {project.teamMembers && <>成员：{project.teamMembers}</>}
                    </small>
                    {project.teamMaterialsUrl && (
                      <a href={project.teamMaterialsUrl} target="_blank" rel="noreferrer">项目组资料 ↗</a>
                    )}
                  </div>
                )}
                <div className="brief-meta">
                  <span>{project.track}</span>
                  <span>{project.duration}</span>
                  <span>{workshop.location}</span>
                </div>
              </div>
            </article>

            <div className="score-section-heading">
              <div>
                <span className="eyebrow">SCORING CRITERIA</span>
                <h2>分维度评分</h2>
                <p>每项采用 0–10 分制，系统按权重换算为满分 10 分的总分。</p>
              </div>
              <span className="autosave-status">
                {dataMode === "bitable"
                  ? dimensionsDone
                    ? "草稿在本设备 · 保存后写入多维表格"
                    : "评分草稿保存在本设备"
                  : dimensionsDone
                    ? "草稿已自动保存 · 本设备"
                    : "评分时自动保存草稿"}
              </span>
            </div>

            <div className="criteria-list">
              {criteria.map((criterion, index) => {
                const value = draft.scores[criterion.id];
                const scored = typeof value === "number";
                const activeRubric = rubricIndex(criterion, value);
                return (
                  <article
                    className={`criterion-card ${scored ? "scored" : ""}`}
                    data-testid={`criterion-${criterion.id}`}
                    key={criterion.id}
                  >
                    <div className="criterion-head">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{criterion.name}</h3>
                        <p>{criterion.description}</p>
                      </div>
                      <strong>{criterion.weight}%<small>权重</small></strong>
                    </div>
                    <div className="score-control">
                      <div className="score-control-head">
                        <span>0–10 分</span>
                        <span>加权贡献 {(scored ? value * criterion.weight / 100 : 0).toFixed(2)} / {(criterion.weight / 10).toFixed(1)}</span>
                      </div>
                      <div className="range-row">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={scored ? value : 0}
                          disabled={editingLocked}
                          aria-label={`${criterion.name}评分`}
                          onChange={(event) => updateScore(criterion.id, Number(event.target.value))}
                        />
                        <label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.1"
                            placeholder="—"
                            value={scored ? value : ""}
                            disabled={editingLocked}
                            aria-label={`${criterion.name}精确分数`}
                            onChange={(event) => {
                              if (event.target.value === "") {
                                mutateDraft((current) => {
                                  const scores = { ...current.scores };
                                  delete scores[criterion.id];
                                  return { ...current, scores };
                                });
                              } else {
                                updateScore(criterion.id, Number(event.target.value));
                              }
                            }}
                          />
                          <span>/ 10</span>
                        </label>
                      </div>
                      <div className="range-scale"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span></div>
                      <div className="quick-scores">
                        <span>快速评分</span>
                        {[6, 7, 8, 9, 10].map((score) => (
                          <button
                            type="button"
                            key={score}
                            data-testid={`quick-${criterion.id}-${score}`}
                            disabled={editingLocked}
                            className={value === score ? "active" : ""}
                            onClick={() => updateScore(criterion.id, score)}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    <details className="rubric">
                      <summary>
                        <strong>评分标准</strong>
                        <span>展开查看判定依据</span>
                      </summary>
                      <div>
                        {criterion.rubrics.map((rubric, rubricPosition) => (
                          <article
                            className={`${rubric.tone} ${activeRubric === rubricPosition ? "active" : ""}`}
                            key={rubric.range}
                          >
                            <header><strong>{rubric.title}</strong><span>{rubric.range}</span></header>
                            <p>{rubric.text}</p>
                          </article>
                        ))}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>

            <section className="nomination-card">
              <div>
                <span className="eyebrow">SPECIAL NOMINATION</span>
                <h2>是否提名「{workshop.nominationName}」</h2>
                <p>每位评委最多提名 {workshop.nominationLimit} 个项目。保存后仍可修改，锁票后最终冻结。</p>
              </div>
              <div className="nomination-options" role="radiogroup" aria-label={`是否提名${workshop.nominationName}`}>
                <label>
                  <input
                    type="radio"
                    name="nomination"
                    checked={draft.nomination === true}
                    disabled={editingLocked || (nominatedIds.size >= workshop.nominationLimit && !nominatedIds.has(project.id))}
                    onChange={() => mutateDraft((current) => ({ ...current, nomination: true }))}
                  />
                  <span><b>是</b>提名本项目</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="nomination"
                    checked={draft.nomination === false}
                    disabled={editingLocked}
                    onChange={() => mutateDraft((current) => ({ ...current, nomination: false }))}
                  />
                  <span><b>否</b>本项目不提名</span>
                </label>
              </div>
              <div className="nomination-count">
                <strong>{nominatedIds.size}/{workshop.nominationLimit}</strong>
                <span>已使用提名名额</span>
                <small>{nominatedIds.size >= workshop.nominationLimit && !nominatedIds.has(project.id) ? "已达到提名上限" : "提名可在锁票前调整"}</small>
              </div>
            </section>

            <section className="judge-note">
              <label htmlFor="judge-note">评审笔记 <span>仅自己可见，不计入评分</span></label>
              <textarea
                id="judge-note"
                rows={4}
                value={draft.note}
                disabled={editingLocked}
                placeholder="记录追问、证据或需要回看的要点…"
                onChange={(event) => mutateDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </section>
          </section>

          <aside className="score-aside">
            <section className="total-card">
              <span>当前加权总分</span>
              <div><strong>{total.toFixed(2)}</strong><small>/ 10</small></div>
              <div className="total-track"><i style={{ width: `${total * 10}%` }} /></div>
              <p>{editingLocked ? "当前评分不可修改" : dimensionsDone === criteria.length ? "六个维度已完成，可保存" : `还有 ${criteria.length - dimensionsDone} 个维度待评分`}</p>
            </section>
            <section className="aside-card">
              <header><h3>我的评审进度</h3><strong>{completedCount}/{workshop.projects.length}</strong></header>
              <div className="progress-track"><i style={{ width: `${completedCount / workshop.projects.length * 100}%` }} /></div>
              <dl>
                <div><dt>当前项目</dt><dd>{project.name}</dd></div>
                <div><dt>已完成维度</dt><dd>{dimensionsDone}/{criteria.length}</dd></div>
                <div><dt>最后保存</dt><dd>{formatDate(submission?.submittedAt)}</dd></div>
              </dl>
            </section>
            <section className="aside-card submit-card">
              <div className={`submit-state ${ballotLocked ? "locked" : submission ? "saved" : ""}`}>
                <i />
                <span>
                  <strong>{ballotLocked ? "评分已锁票" : submission ? "评分已保存" : "评分草稿"}</strong>
                  <small>{ballotLocked ? "最终提交，不可修改" : submission ? `保存于 ${formatDate(submission.submittedAt)}` : "尚未提交"}</small>
                </span>
              </div>
              <button
                className="primary-button"
                data-testid="desktop-submit"
                disabled={!canSubmit || syncing}
                onClick={() => setConfirmOpen(true)}
              >
                {syncing
                  ? "正在写入多维表格…"
                  : submission
                    ? "更新本项目评分"
                    : nextPendingProject()
                      ? "保存并进入下一项目"
                      : "保存本项目评分"}
              </button>
              <button className="secondary-button" disabled={editingLocked} onClick={clearDraft}>清空当前草稿</button>
              <hr />
              <button className="lock-button" disabled={syncing || ballotLocked || completedCount < workshop.projects.length} onClick={lockBallot}>
                {syncing ? "正在同步…" : ballotLocked ? "已锁票" : "锁票（最终提交）"}
              </button>
              <small className="lock-hint">
                {ballotLocked
                  ? "全部评分与提名已冻结"
                  : completedCount < workshop.projects.length
                    ? `已保存 ${completedCount}/${workshop.projects.length}，全部完成后可锁票`
                    : "全部项目已保存，锁票后不可修改"}
              </small>
            </section>
            <section className="judge-identity">
              <span>{judge.seat}</span>
              <label>
                <small>{dataMode === "bitable" ? "当前评委" : "当前演示评委"}</small>
                <select value={judge.id} onChange={(event) => setJudgeId(event.target.value)}>
                  {judgesData.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
                </select>
              </label>
            </section>
          </aside>

          <section className="mobile-score-dock" aria-label="移动端评分汇总">
            <div>
              <span>当前总分</span>
              <strong>{total.toFixed(2)}<small>/10</small></strong>
              <p>{dimensionsDone}/{criteria.length} 个维度已完成</p>
            </div>
            <div className="mobile-score-actions">
              <button data-testid="mobile-submit" disabled={!canSubmit || syncing} onClick={() => setConfirmOpen(true)}>
                {syncing
                  ? "正在同步…"
                  : ballotLocked
                    ? "已锁票"
                    : submission
                      ? "更新评分"
                      : nextPendingProject()
                        ? "保存并继续"
                        : "保存评分"}
              </button>
              {completedCount === workshop.projects.length && !ballotLocked && (
                <button
                  className="mobile-lock-button"
                  data-testid="mobile-lock"
                  disabled={syncing}
                  onClick={lockBallot}
                >
                  最终锁票
                </button>
              )}
            </div>
          </section>
        </section>
      )}

      {view === "admin" && (
        <section className="admin-view">
          <header className="page-heading">
            <div>
              <span className="eyebrow">LIVE OPERATIONS</span>
              <h1>评审管理总览</h1>
              <p>实时掌握评分进度、项目排名、提名票数与收集状态。</p>
            </div>
            <div className="admin-actions">
              <button onClick={toggleChannel}>{channelLocked ? "重新开放评分" : "关闭评分通道"}</button>
              <button onClick={() => window.location.reload()}>刷新多维表格</button>
              <button disabled={dataMode === "bitable"} onClick={fillDemoData}>填满演示数据</button>
              <button onClick={exportCsv}>导出 CSV</button>
              <button className="danger" disabled={dataMode === "bitable"} onClick={resetWorkshop}>重置数据</button>
            </div>
          </header>

          <div className="kpi-grid">
            <article>
              <span>总提交进度</span>
              <strong>{totalTasks ? Math.round(submittedTasks / totalTasks * 100) : 0}%</strong>
              <p>{submittedTasks}/{totalTasks} 份评分</p>
            </article>
            <article>
              <span>参评评委</span>
              <strong>{adminJudgeList.length}</strong>
              <p>已产生有效评分的评委</p>
            </article>
            <article>
              <span>已收齐项目</span>
              <strong>{fullyScoredProjects}</strong>
              <p>全部到场评委均已评分</p>
            </article>
            <article>
              <span>待提交评分</span>
              <strong>{Math.max(0, totalTasks - submittedTasks)}</strong>
              <p>当前工作坊剩余任务</p>
            </article>
          </div>

          <div className="admin-grid">
            <section className="admin-panel matrix-panel">
              <header>
                <div>
                  <h2>评分进度矩阵</h2>
                  <p>实心圆代表该评委已保存该项目评分</p>
                </div>
                <span>{channelLocked ? "CHANNEL CLOSED" : "LIVE"}</span>
              </header>
              <div className="matrix-scroll">
                <div className="matrix-table" style={{ gridTemplateColumns: `minmax(190px, 1fr) repeat(${adminJudgeList.length}, 56px)` }}>
                  <div className="matrix-project matrix-head">项目</div>
                  {adminJudgeList.map((person) => <div className="matrix-judge matrix-head" title={person.name} key={person.id}>{person.seat}</div>)}
                  {workshop.projects.map((item, projectIndex) => (
                    <div className="matrix-row" key={item.id} style={{ display: "contents" }}>
                      <div className="matrix-project">
                        <span>{String(projectIndex + 1).padStart(2, "0")}</span>
                        <div><strong>{item.name}</strong><small>{item.team}</small></div>
                      </div>
                      {adminJudgeList.map((person) => (
                        <div className={`matrix-cell ${workshopSubmissions[person.id]?.[item.id] ? "done" : ""}`} key={person.id}>
                          <i>{workshopSubmissions[person.id]?.[item.id] ? "✓" : ""}</i>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="admin-panel ranking-panel">
              <header>
                <div>
                  <h2>项目实时排名</h2>
                  <p>评分提交后立即计入当前均分</p>
                </div>
                <span>LIVE</span>
              </header>
              <div className="ranking-table">
                <div className="ranking-head"><span>排名 / 项目</span><span>均分</span><span>最高 / 最低</span><span>提名</span><span>进度</span></div>
                {ranking.map((item, index) => (
                  <div className={`ranking-row ${index < 3 && item.count ? "prize" : ""}`} key={item.project.id}>
                    <span className="rank">{item.count ? String(index + 1).padStart(2, "0") : "—"}</span>
                    <div><strong>{item.project.name}</strong><small>{item.project.team}</small></div>
                    <b>{item.count ? item.average.toFixed(2) : "—"}</b>
                    <span>{item.count ? `${item.highest.toFixed(2)} / ${item.lowest.toFixed(2)}` : "— / —"}</span>
                    <span>{item.nominations} 票</span>
                    <em>{item.count}/{adminJudgeList.length}</em>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {view === "awards" && (
        <section className="awards-view">
          {presenting && (
            <button className="presentation-exit" onClick={() => setPresenting(false)}>
              退出演示
            </button>
          )}
          <header className="award-controls">
            <div>
              <span className="eyebrow">AWARDS CEREMONY</span>
              <h1>{workshop.name} · 颁奖台</h1>
              <p>提名奖按票数产生；一、二、三等奖按综合得分产生。</p>
            </div>
            <div>
              <span>数据完成度 <strong>{submittedTasks}/{totalTasks}</strong></span>
              <button disabled={awardIndex === 0} onClick={() => setAwardIndex((value) => value - 1)}>← 上一奖项</button>
              <button onClick={() => setPresenting((value) => !value)}>{presenting ? "退出演示" : "演示模式"}</button>
              <button disabled={awardIndex === awards.length - 1} onClick={() => setAwardIndex((value) => value + 1)}>下一奖项 →</button>
            </div>
          </header>
          <article className={`award-stage award-${awardIndex}`}>
            <div className="award-copy">
              <div className="award-overline"><span>{String(awardIndex + 1).padStart(2, "0")} / 04</span><i /><em>{awards[awardIndex].eyebrow}</em></div>
              <p>{workshop.code} · {workshop.date}</p>
              <h2>{awards[awardIndex].label}</h2>
              <small>{awards[awardIndex].note}</small>
              <div className="winner-block">
                <span>OFFICIAL RESULT</span>
                <h3>{awards[awardIndex].winner?.project.name ?? "等待评审数据"}</h3>
                <p>{awards[awardIndex].winner?.project.summary ?? "评分与提名数据齐全后自动生成"}</p>
                <small>{awards[awardIndex].winner?.project.team ?? "JUDGING IN PROGRESS"}</small>
              </div>
              <div className="award-metric">
                <strong>{awards[awardIndex].metric}</strong>
                <span>{awardIndex === 0 ? "评委提名票数" : "综合得分 / 10"}</span>
              </div>
            </div>
            <div className="award-visual" aria-hidden="true">
              <span>{String(awardIndex + 1).padStart(2, "0")}</span>
              <i />
              <b>{awards[awardIndex].winner?.project.name.slice(0, 1) ?? "A"}</b>
            </div>
          </article>
          <footer className="award-pagination">
            {awards.map((award, index) => (
              <button className={index === awardIndex ? "active" : ""} onClick={() => setAwardIndex(index)} key={award.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>{award.label}
              </button>
            ))}
          </footer>
        </section>
      )}

      {confirmOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-dialog-title" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmOpen(false);
        }}>
          <div className="submit-dialog">
            <span className="dialog-mark" aria-hidden="true">✓</span>
            <p className="eyebrow">READY TO SAVE</p>
            <h2 id="submit-dialog-title">确认保存本项目评分？</h2>
            <p>
              你将保存「{project.name}」的 {criteria.length} 项评分，
              {draft.nomination ? `并提名「${workshop.nominationName}」` : `不提名「${workshop.nominationName}」`}。
              保存后仍可回来修改，直到最终锁票。
            </p>
            <div className="dialog-score">
              <span>加权总分</span><strong>{total.toFixed(2)}</strong><small>/ 10</small>
            </div>
            <div className="dialog-actions">
              <button onClick={() => setConfirmOpen(false)}>返回检查</button>
              <button disabled={syncing} onClick={confirmSubmit}>{syncing ? "正在写入…" : "确认保存"}</button>
            </div>
          </div>
        </div>
      )}

      {lockConfirmOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="lock-dialog-title" onMouseDown={(event) => {
          if (!syncing && event.target === event.currentTarget) setLockConfirmOpen(false);
        }}>
          <div className="submit-dialog">
            <span className="dialog-mark" aria-hidden="true">L</span>
            <p className="eyebrow">FINAL BALLOT</p>
            <h2 id="lock-dialog-title">确认最终锁票？</h2>
            <p>
              你已完成当前工作坊的 {workshop.projects.length} 个项目。
              锁票后，全部评分、提名和评审笔记都会冻结，无法继续修改。
            </p>
            <div className="dialog-actions">
              <button disabled={syncing} onClick={() => setLockConfirmOpen(false)}>返回检查</button>
              <button disabled={syncing} onClick={confirmLockBallot}>
                {syncing ? "正在同步…" : "确认锁票"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </main>
  );
}
