export type Tone = "low" | "mid" | "high";

export type Rubric = {
  range: string;
  title: string;
  text: string;
  tone: Tone;
};

export type Criterion = {
  id: string;
  name: string;
  shortName: string;
  weight: number;
  description: string;
  rubrics: Rubric[];
};

export type ScoringTemplateId = "personal" | "team";

export const SCORE_FIELD_BY_CRITERION_ID: Record<string, string> = {
  d1: "D1得分",
  d2: "D2得分",
  d3: "D3得分",
  d4: "D4得分",
  d5: "D5得分",
  d6: "D6得分",
};

export const SCORING_WEIGHTS = [15, 20, 20, 15, 20, 10] as const;

const criterion = (
  index: number,
  name: string,
  shortName: string,
  description: string,
  low: [string, string],
  mid: [string, string],
  high: [string, string],
): Criterion => ({
  id: `d${index + 1}`,
  name,
  shortName,
  weight: SCORING_WEIGHTS[index],
  description,
  rubrics: [
    { range: "0–3", title: low[0], text: low[1], tone: "low" },
    { range: "4–7", title: mid[0], text: mid[1], tone: "mid" },
    { range: "8–10", title: high[0], text: high[1], tone: "high" },
  ],
});

export const SCORING_TEMPLATES: Record<ScoringTemplateId, { name: string; criteria: Criterion[] }> = {
  personal: {
    name: "个人赛",
    criteria: [
      criterion(0, "问题洞察", "洞察", "是否识别出真实而重要的问题，并能说明个人为何选择解决它。",
        ["问题模糊", "问题来自假设，目标对象和真实场景不清晰。"],
        ["问题成立", "能说明真实场景、核心痛点和基本问题边界。"],
        ["洞察深刻", "有充分证据，抓住关键矛盾并形成独到判断。"]),
      criterion(1, "个人成长与反思", "成长", "是否清楚呈现能力变化、关键学习以及基于反馈完成的迭代。",
        ["成长不明", "只描述完成了什么，看不到学习、反馈或认知变化。"],
        ["成长可见", "能说明关键学习，并展示至少一次有效迭代。"],
        ["成长显著", "反思深入，能把反馈转化为方法并迁移到新问题。"]),
      criterion(2, "Demo 完整度与体验", "Demo", "Demo 是否真实可用、链路完整，并让观众直观看到核心价值。",
        ["难以验证", "主要停留在描述或静态页面，核心链路无法体验。"],
        ["核心可用", "主要任务能够完成，价值和交互基本清晰。"],
        ["体验完整", "真实链路流畅稳定，细节成熟且价值一目了然。"]),
      criterion(3, "执行与完成度", "执行", "从想法到成品的推进是否扎实，关键风险是否得到验证。",
        ["概念阶段", "关键能力尚未实现，主要假设缺少验证。"],
        ["基本完成", "核心能力已实现，仍有少量关键风险。"],
        ["完成度高", "关键能力完整，验证充分，并有清晰的后续计划。"]),
      criterion(4, "成果影响与能力迁移", "影响", "成果是否产生实际改善，并能沉淀为可复用的个人能力或方法。",
        ["影响有限", "效果缺少证据，方法只适用于当前一次任务。"],
        ["影响明确", "已有可观察改善，方法可复用于相邻场景。"],
        ["影响显著", "结果有可信证据，并形成可持续、可迁移的方法。"]),
      criterion(5, "现场演示与答辩", "表达", "演示是否清晰有吸引力，答辩能否准确回应关键问题。",
        ["表达不清", "结构松散，Demo 重点和关键回答不明确。"],
        ["清晰完整", "演示有完整结构，重点明确，回答基本准确。"],
        ["专业有力", "叙事简洁可信，节奏出色，答辩体现深入思考。"]),
    ],
  },
  team: {
    name: "团队赛",
    criteria: [
      criterion(0, "商业问题与客户需求", "需求", "是否抓住真实、重要且值得解决的客户或业务问题。",
        ["问题模糊", "目标客户、业务场景与问题边界不清晰。"],
        ["需求成立", "有真实场景支撑，客户痛点和业务影响基本明确。"],
        ["洞察深刻", "有充分证据，抓住关键矛盾并明确优先级。"]),
      criterion(1, "商业价值与收益测算", "价值", "价值链路、成本收益与关键测算假设是否合理可信。",
        ["价值抽象", "收益仅有定性描述，缺少测算口径和关键假设。"],
        ["价值明确", "能够量化主要收益，成本和假设基本合理。"],
        ["测算可信", "价值链路完整，口径严谨，并有数据或实验支撑。"]),
      criterion(2, "方案差异化", "差异化", "方案在能力、机制或体验上是否形成难以替代的优势。",
        ["常规组合", "主要复用常见做法，竞争优势不明显。"],
        ["局部突破", "在关键环节形成有价值的差异化。"],
        ["优势显著", "重新定义关键流程，优势清晰且具有一定壁垒。"]),
      criterion(3, "落地可行性", "落地", "技术、资源、流程与风险是否支持方案真正实施。",
        ["路径不清", "关键假设尚未验证，资源和落地路径不明确。"],
        ["基本可行", "核心链路已验证，关键资源和风险基本清楚。"],
        ["落地就绪", "技术与运营方案完整，风险可控，计划可执行。"]),
      criterion(4, "规模化与组织价值", "规模化", "方案是否能够扩展、复用并形成长期的组织价值。",
        ["单点应用", "只适用于单一小场景，复用和扩展空间有限。"],
        ["可复制", "能够迁移到相邻团队或类似业务场景。"],
        ["规模化价值", "具备平台化潜力，可形成组织级能力或持续收益。"]),
      criterion(5, "团队表达与答辩", "表达", "团队叙事是否清晰一致，证据是否可信，答辩是否准确有力。",
        ["表达不清", "结构松散，团队口径不一致，关键问题未有效回答。"],
        ["清晰完整", "分工和逻辑完整，重点明确，回答基本准确。"],
        ["专业有力", "叙事简洁可信，配合流畅，答辩体现深入思考。"]),
    ],
  },
};

export function cloneCriteria(criteria: Criterion[]) {
  return criteria.map((item) => ({
    ...item,
    rubrics: item.rubrics.map((rubric) => ({ ...rubric })),
  }));
}

export function validateCriteria(criteria: Criterion[]) {
  if (criteria.length !== 6) return "评分标准必须包含六个维度。";
  for (let index = 0; index < criteria.length; index += 1) {
    const item = criteria[index];
    if (item.id !== `d${index + 1}`) return "评分维度 ID 必须固定为 D1–D6。";
    if (item.weight !== SCORING_WEIGHTS[index]) return "当前版本不允许修改维度权重。";
    if (!item.name.trim() || !item.description.trim()) return `请填写 D${index + 1} 的名称和简介。`;
    if (item.rubrics.length !== 3 || item.rubrics.some((rubric) => !rubric.title.trim() || !rubric.text.trim())) {
      return `请完整填写 D${index + 1} 的低、中、高分判定。`;
    }
  }
  return "";
}
