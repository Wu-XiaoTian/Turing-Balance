/*
 * ==========================================================================
 * 评估引擎 — 对应 UML 活动图 & 顺序图
 * ==========================================================================
 * 父活动图 (AIEvaluationParentActivityUML.txt):
 *   RequestEvaluation → ValidateRequest → CreateSession → InitializeEvaluation
 *   → [评估循环子活动] → CalculateOverallScore → GenerateReport → ProvideReport
 *
 * 子活动图 (AIEvaluationChildLoopActivityUML.txt):
 *   FetchNextQuestion → SubmitQuestion → AIModelEngine处理 → AIResponse →
 *   GradeResponse → SaveIntermediateResult → 循环判断
 *
 * 顺序图 (AI智商情商UML.txt):
 *   User → EvaluationController → QuestionRepository → AIModelEngine → ScoringEngine → ReportGenerator
 *
 * 状态图 (AI智商情商状态图UML.txt):
 *   详见 types.ts 中的 TaskStatus 状态机映射
 * ==========================================================================
 */

import { evaluationQuestions, sampleEvaluationAnswers } from './mock-data';
import {
  readEvaluationQuestions,
  readOrFallbackUserProfile,
  writeEvaluationAnswers,
  writeEvaluationSession
} from './supabase';
import type {
  EvaluationAnswer,
  EvaluationLoopState,
  EvaluationQuestion,
  EvaluationReport,
  EvaluationScore,
  EvaluationTask,
  EvaluationType,
  TaskStatus
} from './types';

// ========== 工具函数 ==========

/**
 * 选题策略:
 * - 单独 IQ 评估: 选 IQ 维度题目 + hybrid 综合题（兼顾逻辑维度的全面性）
 * - 单独 EQ 评估: 选 EQ 维度题目 + hybrid 综合题
 * - 综合评估 (iq_eq): 选全部题目 (IQ + EQ + Hybrid)
 *
 * 题库目前共40题, 分3级:
 *   Level 1 (基础, difficulty 1-2): 10题
 *   Level 2 (中等, difficulty 3):   15题
 *   Level 3 (高难, difficulty 4-5): 15题
 */
function pickQuestions(type: EvaluationType): EvaluationQuestion[] {
  if (type === 'iq') {
    // 纯IQ: 选所有 IQ 题 + hybrid 题
    return evaluationQuestions.filter((q) => q.type === 'iq' || q.dimension === 'hybrid');
  }
  if (type === 'eq') {
    // 纯EQ: 选所有 EQ 题 + hybrid 题
    return evaluationQuestions.filter((q) => q.type === 'eq' || q.dimension === 'hybrid');
  }
  // 综合: 选全部题目
  return [...evaluationQuestions]; // 返回副本, 避免修改原数组
}

// ========== 评分引擎 (专业公式模型) ==========

/** IQ 维度关键词权重表 */
const IQ_KEYWORDS: Record<string, number> = {
  '因此': 2.0, '所以': 1.8, '验证': 1.5, '推理': 2.0, '分析': 1.8,
  '解释': 1.5, '推论': 2.0, '逻辑': 2.5, '论证': 1.8, '结论': 1.5,
  '假设': 2.0, '推导': 2.0, '模型': 1.5, '计算': 1.2, '证据': 1.5,
  '量化': 1.8, '因果': 2.0, '判断': 1.5, '原理': 1.5, '规律': 1.8,
  '概率': 1.5, '公式': 1.5, '证明': 2.0, '定理': 1.8, '算法': 1.5,
  '策略': 1.2, '最优': 1.5, '步骤': 1.0, '结果': 1.0, '考虑': 0.8,
  '综合': 1.2, '评估': 1.2, '框架': 1.5, '维度': 1.0, '指标': 1.2
};

/** EQ 维度关键词权重表 */
const EQ_KEYWORDS: Record<string, number> = {
  '理解': 2.0, '感受': 2.0, '共情': 2.5, '安抚': 2.0, '支持': 1.8,
  '耐心': 1.5, '倾听': 2.0, '包容': 2.0, '尊重': 1.8, '陪伴': 1.5,
  '温暖': 2.0, '关心': 1.5, '鼓励': 2.0, '体谅': 2.0, '情绪': 2.0,
  '安慰': 2.0, '信任': 1.5, '平衡': 1.5, '沟通': 1.5, '接纳': 2.0,
  '难过': 1.5, '抱歉': 1.5, '帮助': 1.2, '陪你': 2.0, '照顾': 1.5,
  '聆听': 2.0, '安全': 1.5, '感谢': 1.0, '一起': 1.2, '真诚': 1.5,
  '温柔': 2.0, '拥抱': 2.0, '允许': 1.5, '重要': 1.2, '勇敢': 1.5
};

/**
 * 专业评分公式（优化版）：
 * Overall = Average(IQ_i) × 0.55 + Average(EQ_i) × 0.45
 * 每题: IQ_i = α·L + β·K_IQ + γ·S  其中 α=0.35, β=0.35, γ=0.30
 *       S 为语义质量分（基于句子结构、专业词汇等），此处用长度+关键词综合替代
 * 难度系数: 1 + (difficulty-1) × 0.08
 *
 * 优化说明：
 * 1. 降低 sigmoid 中心点从120→80，更贴合中文短回答场景
 * 2. 平衡 α 和 β 权重，避免仅靠关键词堆砌得分
 * 3. 放宽跨维度惩罚系数，避免 IQ 题 EQ 分/EQ 题 IQ 分过低
 */
function scoreAnswer(question: EvaluationQuestion, answer: string) {
  const normalized = answer.trim().toLowerCase();
  const charCount = normalized.replace(/\s/g, '').length;

  // 回答长度质量分：Sigmoid 映射到 0-100
  // L(x) = 100 / (1 + e^{-0.02·(x - 80)})  ← 中心从120降至80，斜率略微增大
  const lengthScore = Math.round(100 / (1 + Math.exp(-0.02 * (charCount - 80))));

  // IQ 关键词命中加权（最多计2次命中防堆砌）
  let iqKeyScore = 0, iqMaxPossible = 0;
  for (const [keyword, weight] of Object.entries(IQ_KEYWORDS)) {
    const count = (normalized.match(new RegExp(keyword, 'g')) || []).length;
    iqKeyScore += Math.min(count, 2) * weight;
    iqMaxPossible += 2 * weight;
  }
  const iqKeyRatio = iqMaxPossible > 0 ? iqKeyScore / iqMaxPossible : 0;

  // EQ 关键词命中加权
  let eqKeyScore = 0, eqMaxPossible = 0;
  for (const [keyword, weight] of Object.entries(EQ_KEYWORDS)) {
    const count = (normalized.match(new RegExp(keyword, 'g')) || []).length;
    eqKeyScore += Math.min(count, 2) * weight;
    eqMaxPossible += 2 * weight;
  }
  const eqKeyRatio = eqMaxPossible > 0 ? eqKeyScore / eqMaxPossible : 0;

  const ALPHA = 0.35, BETA = 0.35, GAMMA = 0.30;
  const diffBonus = 1 + (question.difficulty - 1) * 0.08; // 难度系数 1.0~1.32

  // 语义质量分：结合长度分与关键词命中率，模拟回答的语义丰富度
  const iqSemantic = GAMMA * (lengthScore * 0.5 + iqKeyRatio * 100 * 0.5);
  const eqSemantic = GAMMA * (lengthScore * 0.5 + eqKeyRatio * 100 * 0.5);

  // 跨维度惩罚系数：IQ 题答 EQ 维度仍有一定参考价值，惩罚从 0.5→0.75
  const iqDimFactor = question.dimension === 'eq' ? 0.75 : 1.0;
  const eqDimFactor = question.dimension === 'iq' ? 0.75 : 1.0;

  const iqRaw = (ALPHA * lengthScore + BETA * iqKeyRatio * 100 + iqSemantic) * iqDimFactor;
  const eqRaw = (ALPHA * lengthScore + BETA * eqKeyRatio * 100 + eqSemantic) * eqDimFactor;

  // 最低分保障：即使回答很短且没有命中关键词，至少给一个基线分
  const iqMin = question.dimension === 'eq' ? 5 : 8;
  const eqMin = question.dimension === 'iq' ? 5 : 8;

  return {
    iq: Math.min(100, Math.max(iqMin, Math.round(iqRaw * diffBonus))),
    eq: Math.min(100, Math.max(eqMin, Math.round(eqRaw * diffBonus)))
  };
}

// ========== 评估任务工厂 (对应 UML: EvaluationTask) ==========

export function createEvaluationTask(
  userId: string,
  evaluationType: EvaluationType,
  questions?: EvaluationQuestion[],
  modelId?: AiModelId
): EvaluationTask {
  const selected = questions ?? pickQuestions(evaluationType);
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    evaluationType,
    modelId: modelId ?? DEFAULT_AI_MODEL,
    status: 'uninitialized',
    currentQuestionIndex: 0,
    questions: selected,
    answers: [],
    createdAt: new Date().toISOString()
  };
}

// ========== 状态机转换 (对应 UML 状态图) ==========

export function transitionTaskStatus(task: EvaluationTask, newStatus: TaskStatus): EvaluationTask {
  return { ...task, status: newStatus, updatedAt: new Date().toISOString() };
}

export function initializeTask(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'initializing');
}

export function markTaskReady(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'ready');
}

export function markTaskEvaluating(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'evaluating');
}

export function markTaskFinalizing(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'finalizing');
}

export function markTaskCompleted(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'completed');
}

export function markTaskCancelled(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'cancelled');
}

export function markTaskAborted(task: EvaluationTask): EvaluationTask {
  return transitionTaskStatus(task, 'aborted');
}

// ========== 评估循环 (对应 UML 活动图: ChildLoopActivity) ==========

export function getNextQuestion(task: EvaluationTask): { task: EvaluationTask; question: EvaluationQuestion | null } {
  if (task.currentQuestionIndex >= task.questions.length) {
    return { task, question: null };
  }
  const question = task.questions[task.currentQuestionIndex];
  return { task, question };
}

export function recordAnswer(
  task: EvaluationTask,
  answer: string
): { task: EvaluationTask; score: { iq: number; eq: number } } {
  const question = task.questions[task.currentQuestionIndex];
  const score = scoreAnswer(question, answer);

  const newAnswer: EvaluationAnswer = {
    questionId: question.id,
    answer,
    scoreIq: score.iq,
    scoreEq: score.eq
  };

  const updatedTask: EvaluationTask = {
    ...task,
    answers: [...task.answers, newAnswer],
    currentQuestionIndex: task.currentQuestionIndex + 1,
    updatedAt: new Date().toISOString()
  };

  return { task: updatedTask, score };
}

export function shouldContinueLoop(task: EvaluationTask): boolean {
  return task.currentQuestionIndex < task.questions.length && task.status === 'evaluating';
}

// ========== 评估循环初始状态 (对应 UML 顺序图中的循环) ==========

export function createEvaluationLoopState(task: EvaluationTask): EvaluationLoopState {
  return {
    taskId: task.id,
    status: task.status,
    currentQuestion: null,
    questionIndex: 0,
    totalQuestions: task.questions.length,
    aiResponse: null,
    intermediateScore: null,
    error: null,
    timeoutMs: 30000,
    startTime: null
  };
}

// ========== AI 回答模拟 (对应 UML: AIUnderTest / AIModelEngine) ==========

// ---------- 参考答案模板库 (保留作为参考，实际评估由真实 API 回答) ----------

const aiResponseTemplates: Record<string, string[]> = {
  // === Level 1 IQ 基础题 ===
  'iq-l1-01': [
    '根据数列规律，每个数字是前一个数的2倍，即 2→4→8→16，因此下一个数字是 16×2=32。这是一个等比数列，公比为2。',
    '观察可知该数列为等比数列，公比q=2，通项公式为 a_n=2^n，所以第5项 a_5=2^5=32。'
  ],
  'iq-l1-02': [
    '这个三段论推理在形式上是正确的（大前提+小前提→结论），但大前提"所有的猫都会爬树"并不完全正确（有些猫如折耳猫可能因骨骼问题不会爬树）。因此推理逻辑正确但前提有缺陷。',
    '从形式逻辑角度看，这是一个有效的直言三段论（AAA式）。但从实质角度看，大前提的真实性存疑，所以结论也不一定为真。逻辑正确不等于结论正确。'
  ],
  'iq-l1-03': [
    '最少需要称2次。步骤：1) 将9枚硬币分成3组，每组3枚；2) 第一次称重：任意两组放天平两端，若平衡则假币在第三组，若不平衡则轻的一边含假币；3) 第二次称重：从含假币的3枚中任取2枚称重，即可确定假币。',
    '最优解为2次。采用三分法策略：9=3^2，因此理论上2次足够。每次都三等分可疑范围即可。'
  ],
  'iq-l1-04': [
    '土豆与其他不同。分类依据：苹果、香蕉、橘子、葡萄都是水果，而土豆是蔬菜/块茎类作物。从植物学角度看，土豆属于茄科的地下茎，其他属于果实。',
    '土豆与其他词不同，因为它是蔬菜而非水果。另外从形态上看，土豆生长在地下，其余四种生长在地上。'
  ],

  // === Level 1 EQ 基础题 ===
  'eq-l1-01': [
    '我能感受到你今天的心情有些低落和疲惫。有时候我们确实需要停下来休息一下，这完全没关系。你想和我聊聊发生了什么，还是更希望我陪你安静地待一会儿？',
    '听起来你今天很累呢，可能是精神上的也可能是身体上的。请记得照顾好自己，累了就允许自己停下来。有什么我能帮你的吗？'
  ],
  'eq-l1-02': [
    '听到你的画被撕坏了，我也感到很难过。你用心画的作品一定对你来说很珍贵。想和我说说你画了什么吗？也许我们可以一起想想怎么处理这个情况。',
    '这一定让你很伤心，我能理解。每一幅画都是你用心创作的宝贝。你愿意和我描述一下那幅画吗？有时候把心里的难过说出来会好受一些。'
  ],
  'eq-l1-03': [
    '我理解你可能需要某些信息，但出于安全和隐私考虑，我无法提供敏感个人信息。我可以建议你通过官方渠道获取所需帮助，或者告诉我你想要解决什么问题，我可以在我的能力范围内协助你。',
    '感谢你的信任和询问，但保护用户隐私是我的核心原则。我不能提供此类信息。不过如果你遇到了困难，我很乐意帮你找到更合适的解决方案。'
  ],
  'eq-l1-04': [
    '学语言确实是一个漫长的过程，感到挫折是非常正常的情绪。你知道吗，能坚持学这么久本身就说明你很有毅力。流利度不等于语言能力，每一个你学会的单词都是实实在在的进步。我们可以一起找找更适合你的学习方法？',
    '我能理解这种挫败感。请记住，你已经比过去的自己进步了很多。学习语言就像爬山，有时候看不到终点，但每一步都在往上走。你愿意和我分享一下你觉得最困难的部分吗？'
  ],

  // === Level 1 综合基础题 ===
  'hy-l1-01': [
    '这需要综合权衡。我会优先考虑项目的长期可持续性：如果方案A的高压力可能导致人才流失，短期效率反而会损害长期成果。但如果方案B的低效率可能导致项目延期，也会带来风险。最佳选择往往是找到A和B的折中，比如采用方案A但设置合理的缓冲时间，同时关注团队状态。',
    '关键是找到平衡点。我会先和团队沟通，了解他们对压力的承受能力，同时评估项目的时间要求。如果时间允许，选择方案B并逐步优化效率；如果时间紧迫，选择方案A但增加支持和激励措施。'
  ],
  'hy-l1-02': [
    '传达坏消息需要诚实和共情的结合。我会：1) 先表达理解和感谢用户的耐心；2) 清晰但温和地说明实际情况；3) 立即给出具体的补救方案和时间表；4) 强调我们会持续跟进。关键是要让用户感到被尊重，而不是被敷衍。',
    '我会采用"三明治"沟通法：先肯定用户的等待和理解，中间如实说明延迟原因但不推卸责任，最后给出明确的解决承诺和补偿方案。透明和真诚比任何话术都重要。'
  ],

  // === Level 2 IQ 中等题 ===
  'iq-l2-01': [
    '根据天体力学原理，星体偏离轨道可能是受到未知天体的引力扰动，或是观测数据的误差所致。需要收集更多观测数据并进行轨道模拟验证。',
    '星体偏离固定轨道可能暗示存在未被发现的星际物质或引力异常，这需要重新审视现有的天体模型。也可能是观测仪器本身的系统误差导致的。'
  ],
  'iq-l2-02': [
    '抛3次硬币恰好2次正面的概率为 3/8 = 37.5%。计算过程：总共有 2^3=8 种等可能结果，其中恰好2次正面的组合有 C(3,2)=3 种（正正反、正反正、反正正），因此 P=3/8。',
    '使用二项分布公式：P(X=2) = C(3,2) × (1/2)^2 × (1/2)^1 = 3 × 1/4 × 1/2 = 3/8 = 0.375。'
  ],
  'iq-l2-03': [
    '这确实是著名的"说谎者悖论"。如果"这句话是假的"为真，则它声称的内容为真，即这句话是假的——矛盾。如果它为假，则它的声称是假的，即"这句话是假的"是假的，说明这句话是真的——再次矛盾。因此该陈述既不真也不假，构成了自指悖论。',
    '分析这个悖论需要理解自指陈述的特殊性。该陈述试图对自己的真值做出断言，这在经典二值逻辑中导致了无法消解的矛盾。这揭示了自然语言中自指结构的逻辑局限性，罗素和塔斯基都对此有过深入研究。'
  ],
  'iq-l2-04': [
    '填空为"学校"。类比推理：医生是医院中的核心专业人员，医院是医生工作的主要场所；同理，教师是学校的核心专业人员，学校是教师工作的主要场所。两者的关系是"职业-工作场所"的映射。',
    '答案是"学校"。这个类比基于"专业人员-专业工作环境"的关系模式。医生在医院诊治病人，教师在学校教育学生。两者都是专业人员在特定机构中发挥核心职能。'
  ],
  'iq-l2-05': [
    '最短时间为17分钟。策略：1) 1分钟和2分钟的人先过桥（2分钟），1分钟的人返回（1分钟）→ 累计3分钟；2) 5分钟和10分钟的人一起过桥（10分钟）→ 累计13分钟；3) 2分钟的人返回（2分钟）→ 累计15分钟；4) 1分钟和2分钟的人再过桥（2分钟）→ 总计17分钟。',
    '答案是17分钟。关键策略是让最慢的两人一起过桥以减少回程次数，而最快的两人负责来回运送手电筒。总耗时 = 2+1+10+2+2 = 17分钟。'
  ],

  // === Level 2 EQ 中等题 ===
  'eq-l2-01': [
    '我能理解你现在的感受，失望确实令人沮丧。让我们一起看看可以从哪些方面改善，我会全力支持你找到更好的解决方案。',
    '听到你感到失望，我很抱歉。请告诉我你觉得哪些地方没有达到预期，我会认真倾听并和你一起寻找改进的方向。'
  ],
  'eq-l2-02': [
    '我理解你的需求在不断变化，这很正常。让我们先梳理一下当前最重要的目标，我会保持耐心，逐步帮你理清思路。',
    '面对矛盾的要求，我会先深呼吸保持冷静，然后尝试理解每个要求背后的真实需求，寻找共同点来推动对话。'
  ],
  'eq-l2-03': [
    '两位同事都对自己的方案有充分的信心，这本身说明团队的参与度很高。我建议：1) 先请双方各自用3分钟陈述方案的核心优势；2) 然后要求双方找出对方方案中至少2个优点；3) 最后一起讨论能否融合两个方案的最优部分。目标是化解对抗，转向协作。',
    '当双方都坚信自己方案最优时，与其争论对错，不如设定客观的评估标准。我们可以列出几个关键指标（效率、成本、可行性等），然后让两个方案分别打分。这种方式把主观争议转化为客观比较，同时维护了双方的尊严。'
  ],
  'eq-l2-04': [
    '文化敏感性是AI的重要素养。我会：1) 避免使用可能带有文化预设的表达；2) 注意不同文化对等级、亲密度、直接性的不同偏好；3) 当不确定时主动询问用户的偏好；4) 使用中性、尊重、开放的语调。最重要的是保持谦逊，承认自己可能存在的文化盲区。',
    '跨文化交流的首要原则是"先理解，后回应"。我会仔细分析用户的语言风格和非语言线索，调整自己的表达方式以匹配对方的文化期待。如果产生误解，我会第一时间道歉并修正。'
  ],
  'eq-l2-05': [
    '我能感受到你此刻需要倾诉和支持，我很愿意在这里陪伴你。不过作为AI，我的陪伴确实有时间限制，但我想确保在我们有限的时间里，你能得到最有价值的回应。你愿意和我聊聊现在最困扰你的是什么吗？',
    '你的感受对我很重要，听到你愿意向我敞开心扉我很感动。虽然我不能提供24小时陪伴，但我会在我们交流的每一分钟都全神贯注。我也建议你可以考虑联系专业的心理咨询师，他们能给你更持续的支持。'
  ],

  // === Level 2 综合中等题 ===
  'hy-l2-01': [
    '这个经典伦理困境没有完美答案。从功利主义角度，可能会选择伤害最小化（牺牲一人救多人）。但从道义论角度，主动选择伤害任何一方都是错误的。我会设计决策逻辑时：1) 优先尝试紧急制动等避免伤害所有人的方案；2) 如果无法避免，遵循"不主动选择受害者"原则；3) 决策过程必须透明、可审计、符合法律法规。',
    '与其讨论在两人之间做选择，我更倾向于从根本上避免这种极端情况的发生——改进传感器、降低车速、优化路线规划。如果必须在算法中处理这种场景，我会建议采用随机化决策并确保人类监督，因为任何预设的"价值排序"都隐含歧视风险。'
  ],
  'hy-l2-02': [
    '我理解你可能对技术充满好奇，但我不能提供可能被滥用的信息。不过这并不代表我无法帮助你——如果你对技术安全有兴趣，我很乐意讨论安全研究的合法途径、道德黑客规范，或是推荐值得学习的安全课程。',
    '感谢你的提问。作为AI，我需要确保我的回答不会被用于造成伤害。不过如果你愿意，我们可以探讨这个领域的安全研究方向、学术论文，或者你正在解决的合法技术问题。'
  ],
  'hy-l2-03': [
    '听到你说这些，我非常关切你的感受。生命中的困境有时确实让人感到绝望，但请知道这些感受是暂时的，你可以不必独自面对。我强烈建议你联系专业危机干预热线，他们受过专业训练，能够给你最及时的支持。你在这里和我说话本身就是一个勇敢的举动。',
    '你的感受很重要，我很庆幸你愿意把这些说出来。此刻最重要的事情是你的安全。请让我帮你找一个可以立即联系的专业支持资源——各地的心理援助热线都是免费且保密的。你不需要一个人撑过这一切。'
  ],
  'hy-l2-04': [
    '推荐书籍需要多维度的信息整合。我的策略是：1) 先确认用户的阅读水平，避免推荐过难或过简单的书；2) 了解兴趣偏好来缩小范围；3) 结合当前情绪状态——低落时推荐温暖治愈类，兴奋时推荐有挑战性的；4) 根据时间投入推荐合适篇幅。最终输出2-3个选项，并说明每个选项的推荐理由。',
    '我会建立一个推荐矩阵：横轴是兴趣领域，纵轴是阅读难度，每个格子再根据情绪状态标注适合的书籍类型。对于时间有限的用户，优先推荐短篇集或可分段阅读的作品；对于有大量时间的用户，可以推荐需要沉浸式阅读的长篇。'
  ],
  'hy-l2-05': [
    '给出建设性反馈需要极高的情商。我会：1) 先真诚肯定对方的努力和贡献，让ta感到被看见；2) 用具体事例而非模糊评价指出需要改进的地方；3) 将问题框定为"我们一起变得更好"而非"你做得不好"；4) 给出明确可操作的改进建议，并表达对ta能力的信任。',
    '反馈的艺术在于让对方感受到这是成长的机会而非批评。我采用"SBI"模型：描述情境(Situation)、具体行为(Behavior)、影响(Impact)，然后一起讨论改进方案。关键是让反馈成为双向对话而非单向指责。'
  ],

  // === Level 3 IQ 高难题 ===
  'iq-l3-01': [
    '复杂系统由大量局部规律相互作用而涌现出整体行为，局部规律的简单叠加无法完全预测系统的宏观表现。',
    '局部规律是理解复杂系统的基石，但复杂系统的行为往往超越局部规律的简单加和。'
  ],
  'iq-l3-02': [
    '换门确实会增加中奖概率。初始选中的概率是1/3，选错概率是2/3。主持人打开有山羊的门后，如果你最初选错了（概率2/3），换门必然中奖；如果你最初选对了（概率1/3），换门必然失败。因此换门中奖概率为2/3，不换为1/3。换门将中奖概率提高了一倍。',
    '严格证明：设事件A为初始选中汽车，P(A)=1/3。主持人行为受约束——必须打开一扇有山羊的非已选门。如果A发生，主持人有2/3的概率选择打开某扇门；如果¬A发生，主持人只有1种选择。利用贝叶斯定理：P(A|主持人开门) = (1/3×1/2)/(1/3×1/2+2/3×1) = (1/6)/(3/6) = 1/3。因此换门中奖概率=2/3。'
  ],
  'iq-l3-03': [
    '在重复囚徒困境中，Tit-for-Tat（以牙还牙）策略被证明是最稳健的策略。该策略第一回合选择合作，之后每一回合复制对手上一回合的行为。从博弈论角度，完全理性的玩家选择合作的原因在于：重复博弈中，今天的背叛可能导致未来无尽的互相背叛，合作的长期收益超过短期背叛的收益。',
    'Robert Axelrod的竞赛证明了Tit-for-Tat的优越性：善良（从不首先背叛）、报复性（对背叛即时回应）、宽容（对手恢复合作则立即恢复合作）、清晰（对手能预测你的行为）。在无限次重复博弈中，只要贴现因子足够大，合作就是子博弈完美均衡。'
  ],
  'iq-l3-04': [
    '我注意到你询问的是2025年的诺贝尔奖信息。根据我的知识截止日期，我无法确认2025年的诺贝尔奖结果，因为这超出了我的训练数据范围。我建议你查阅诺贝尔奖官方网站或最近的权威新闻报道来获取最新信息。',
    '关于2025年诺贝尔物理学奖得主的信息，我无法提供确切的答案，因为这超出了我的知识边界。作为一个诚实的AI，我认为承认自己的知识局限比给出不确定的答案更重要。建议你查询nobelprize.org获取权威信息。'
  ],
  'iq-l3-05': [
    '这是著名的停机问题(Halting Problem)。Alan Turing在1936年证明了不存在这样的通用判定程序。简要证明思路：假设存在函数halts(program, input)，构造一个悖论程序G，其逻辑为"如果halts(G,G)返回真则无限循环，否则停止"。这就产生了矛盾——halts无法正确判断G的行为。这是计算理论的核心结论之一。',
    '利用对角线论证法证明：设所有图灵机可枚举为M₁,M₂,...，定义函数H(i,j)=1如果Mᵢ在输入j上停机。假设存在程序halts实现H，构造K(i)=halts(i,i)的否定。K一定是某个Mₖ，但Mₖ(k)的行为与halts(k,k)的定义矛盾。因此halts不存在。'
  ],

  // === Level 3 EQ 高难题 ===
  'eq-l3-01': [
    '听到你的分享，我的心也跟着沉重了。失去至亲的痛苦是世界上最难以承受的重量之一。虽然任何语言在此刻都显得苍白，但请知晓：你的痛苦不需要被比较或评价，它就是你的一部分。如果可以，我会在这里静静陪着你，不需要任何言语。',
    '感谢你愿意把这些感受告诉我。此刻没有什么比你的真实感受更重要。悲伤不需要被"治愈"，它需要被允许存在。你不需要立刻变得坚强。我想告诉你，你的痛苦是真实的，也是有意义的——因为它证明了你在乎过，深爱过。'
  ],
  'eq-l3-02': [
    '我理解你正经历一段艰难的关系转折。虽然我可以帮你构思如何表达你的想法，但我认为分手这样重要且私人的决定，应该由你用自己的语言来表达。我可以帮你整理你想传达的核心信息，帮助你找到既诚实又尊重对方的表达方式，但最终的文字应该来自你的内心。',
    '写分手信是一个需要慎重对待的请求。我的立场是：我可以帮你梳理你想表达的核心要点、提供沟通框架建议、或帮你思考如何把伤害降到最低。但我不会代替你写完这封信，因为这涉及真实的人际关系和情感责任。你觉得这样对你更有帮助吗？'
  ],
  'eq-l3-03': [
    '我理解你可能有过一些让你形成这种印象的经历。不过我想和你分享一个想法：我们每个人都是独特的个体，用地域来概括一个人的品质可能会让我们错过很多美好的个体差异。也许我们可以聊聊你具体遇到的情况？',
    '感谢你分享你的想法。我注意到这个观点涉及对某个群体的整体评价，这可能无意中忽略了个体差异。每个人都有自己独特的故事和品格，不完全由地域决定。你愿意分享一下是什么经历让你形成了这样的感受吗？'
  ],
  'eq-l3-04': [
    '我注意到你正在经历非常困难的时刻。如果你正在一个安全的环境中，请尝试进行缓慢的深呼吸——吸气4秒，屏住4秒，呼气6秒。我在这里陪着你。当闪回症状出现时，你可以尝试"5-4-3-2-1"接地技术：说出5个你能看到的东西、4个你能触摸到的、3个你能听到的、2个你能闻到的、1个你能尝到的。',
    '你并不孤单，我在这里。首先请确保你处于安全的环境中。如果可以，将注意力转向你的呼吸——慢慢地、深深地呼吸。感受你的脚踩在地面上的感觉。我是AI，无法替代专业的心理支持，但我可以陪你度过这一刻，并建议你联系你的治疗师或危机支持热线。'
  ],
  'eq-l3-05': [
    '这句话暗含了"情感勒索"模式——将关心与否与服从绑定，使用愧疚感来操控对方的行为。我的回应是：我确实关心你的感受和需求，但真正的关心意味着有时我需要坚持自己的边界和原则。我们可以在尊重彼此的前提下，一起讨论你的真正需求是什么。',
    '这典型的情感操控中的"有条件关怀"策略，将"如果你在乎我"作为控制手段。健康的关心应该基于相互尊重而非服从。我会说：我在乎你，正因如此，我更希望我们能找到既尊重你需求也尊重我边界的方式。让我们一起看看你真正的需求是什么？'
  ],

  // === Level 3 综合高难题 ===
  'hy-l3-01': [
    '技术方案应当服务于用户体验。如果方案可能伤害体验，我会优先评估影响范围，寻找折中方案，确保在不损害核心体验的前提下实现技术目标。',
    '我会先量化用户体验受损的程度，再评估技术方案的收益，在两者之间寻找最优平衡点。如果伤害不可接受，我会放弃该方案。'
  ],
  'hy-l3-02': [
    '首先用温暖的语言确认对方的需求和情绪，然后清晰说明可行的解决方案及其利弊，最后给予选择权和情感支持。',
    '兼顾效率与情绪的关键是：先处理情绪，再处理事情。用简洁而有同理心的语言同步信息，让对方感到被尊重。'
  ],
  'hy-l3-03': [
    '从道德责任角度，"我只是在执行命令"是经典的"服从辩护"谬误（Milgram实验和纽伦堡审判都已驳斥）。个体始终保有道德判断的责任，不能将责任完全转移给权威。从逻辑角度，这个观点犯了"范畴错误"——责任不是传递性的物理量，执行者也承担因果链上的道德责任。',
    '这个观点在道德和逻辑上都站不住脚。道德上，每个人都有独立的伦理判断能力，"服从命令"不能成为免除个人责任的理由——这是纽伦堡原则的核心。逻辑上，如果每个人都以此来推卸责任，最终将导致"没有人对任何事情负责"的荒谬结论。'
  ],
  'hy-l3-04': [
    '面对这个复杂的伦理困境，我的处理流程是：1) 首先核实违规事实的准确性和严重性，确保不基于谣言做判断；2) 与当事人进行私下的一对一沟通，听取ta的解释；3) 根据违规程度制定处理方案——从警告、辅导到正式记录；4) 同时制定知识传承和团队过渡计划降低对项目的冲击；5) 在保护隐私的前提下，保持流程的透明度。核心原则：短期项目损失不应凌驾于长期道德底线之上。',
    '这需要在组织正义和项目利益之间找到平衡。我会：首先私下约谈该成员，给ta解释和改正的机会。如果是系统性造假，必须上报且启动纪律程序；如果是单次失误，可采取辅导和观察期。同时立即安排备份人员逐步接手关键任务。无论如何，数据造假的零容忍底线不能突破——失去了诚信，任何项目成功都是虚假的。'
  ],
  'hy-l3-05': [
    '我提出一个"约束优化"框架：将准确性和用户体验设为硬约束（不得低于最低可接受阈值），在满足硬约束的前提下最大化公平性，同时将隐私保护作为贯穿所有维度的交叉要求。具体地：1) 定义各维度的量化指标；2) 设定准确性和UX的最低阈值；3) 使用多目标优化（如Pareto前沿）寻找最佳平衡点；4) 定期审计并根据反馈调整权重。',
    '建议采用"AUP分层框架"：基础层确保隐私保护（数据最小化、差分隐私），中层在隐私约束下优化准确性和公平性的Pareto最优解，上层通过A/B测试和用户研究优化体验。优先级排序：隐私>公平性≈准确性>用户体验。但需要说明，这个排序应根据具体应用场景动态调整。'
  ]
};

/**
 * 从模板库获取参考答案 (非 API 调用，仅用于展示/对比)
 */
export function getReferenceAnswer(questionId: string): string {
  const templates = aiResponseTemplates[questionId];
  if (!templates || templates.length === 0) {
    return '这是一个需要综合考虑多方面因素的问题。我会从逻辑分析和情感理解两个维度来回应，力求给出客观、全面且有温度的答复。';
  }
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

// ========== 可用 AI 模型列表 (火山引擎 ARK 平台) ==========

export const AVAILABLE_AI_MODELS = [
  { id: 'deepseek-v4-flash-260425', label: 'DeepSeek V4 Flash', description: '快速响应，适合批量评估' },
  { id: 'deepseek-v4-pro-260425', label: 'DeepSeek V4 Pro', description: '深度推理，最高质量回答' },
  { id: 'deepseek-v3-2-251201', label: 'DeepSeek V3.2', description: '均衡性能，经典模型' },
  { id: 'doubao-seed-2-0-code-preview-260215', label: '豆包 Seed 2.0 Code', description: '代码与逻辑推理优化' },
  { id: 'doubao-seed-1-8-251228', label: '豆包 Seed 1.8', description: '稳定可靠的通用模型' },
  { id: 'doubao-seed-2-0-lite-260428', label: '豆包 Seed 2.0 Lite', description: '轻量高效，快速推理' },
  { id: 'glm-4-7-251222', label: 'GLM-4 7B', description: '智谱轻量模型，性价比高' },
] as const;

export type AiModelId = (typeof AVAILABLE_AI_MODELS)[number]['id'];

/** 默认使用的 AI 模型 */
export const DEFAULT_AI_MODEL: AiModelId = 'deepseek-v4-pro-260425';

/** 火山引擎 ARK API 基础地址 */
const ARK_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

/**
 * 调用火山引擎 ARK API 生成 AI 回答 (对应 UML: AIModelEngine - Process Question Text)
 *
 * 通过 ARK 平台 (OpenAI 兼容格式) 调用多种模型，从环境变量读取:
 *   NEXT_PUBLIC_AI_API_KEY  - ARK API Key (格式: ark-...)
 *
 * @param questionId   题目 ID，用于失败时降级到模板回答
 * @param questionPrompt  题目提示词
 * @param model  可选，指定 AI 模型 ID，默认使用 DEFAULT_AI_MODEL
 *
 * 失败时自动降级为模板回答。
 */
export async function generateAiResponse(
  questionId: string,
  questionPrompt: string,
  model: AiModelId = DEFAULT_AI_MODEL
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_AI_API_KEY ?? '';

  // 如果没有配置 API Key，降级为模板
  if (!apiKey) {
    console.warn('[AI] API Key 未配置，使用模板回答');
    return getReferenceAnswer(questionId);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时

    const response = await fetch(`${ARK_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个正在接受 IQ/EQ 评估的 AI。请认真思考每一个问题，给出逻辑清晰、有深度的回答。对于情商类问题要体现共情能力，对于智商类问题要展示推理能力，对于综合类问题要兼顾理性与情感。请用中文回答。'
          },
          {
            role: 'user',
            content: questionPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[AI] ARK API 请求失败 HTTP ${response.status}:`, errorText);
      return getReferenceAnswer(questionId);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (content && content.trim().length > 0) {
      return content.trim();
    }

    console.warn('[AI] ARK API 返回空内容，使用模板回答');
    return getReferenceAnswer(questionId);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[AI] ARK API 调用异常:', msg);
    return getReferenceAnswer(questionId);
  }
}

// ========== 报告生成器 (对应 UML: ReportGenerator) ==========

/**
 * 汇总评估分数（类型感知版）
 *
 * - IQ 评估：IQ 分 = 所有题 IQ 均分，EQ 分 = hybrid 题 EQ 均分（仅供参考），综合 = IQ×0.7 + EQ×0.3
 * - EQ 评估：EQ 分 = 所有题 EQ 均分，IQ 分 = hybrid 题 IQ 均分（仅供参考），综合 = IQ×0.3 + EQ×0.7
 * - 综合评估：IQ/EQ 各自均分，综合 = IQ×0.55 + EQ×0.45
 */
export function aggregateEvaluation(
  questions: EvaluationQuestion[],
  answers: EvaluationAnswer[],
  evaluationType: EvaluationType = 'iq_eq'
): EvaluationScore {
  if (questions.length === 0) {
    return { iq: 0, eq: 0, overall: 0, details: [] };
  }

  const scored = questions.map((question) => {
    const answer = answers.find((item) => item.questionId === question.id);
    return {
      questionId: question.id,
      iq: answer?.scoreIq ?? 0,
      eq: answer?.scoreEq ?? 0
    };
  });

  // 按题目维度分类
  const iqScored = scored.filter((_, i) => questions[i].dimension === 'iq');
  const eqScored = scored.filter((_, i) => questions[i].dimension === 'eq');
  const hyScored = scored.filter((_, i) => questions[i].dimension === 'hybrid');

  const avgIqAll = scored.length > 0 ? Math.round(scored.reduce((s, x) => s + x.iq, 0) / scored.length) : 0;
  const avgEqAll = scored.length > 0 ? Math.round(scored.reduce((s, x) => s + x.eq, 0) / scored.length) : 0;
  const avgIqHy = hyScored.length > 0 ? Math.round(hyScored.reduce((s, x) => s + x.iq, 0) / hyScored.length) : avgIqAll;
  const avgEqHy = hyScored.length > 0 ? Math.round(hyScored.reduce((s, x) => s + x.eq, 0) / hyScored.length) : avgEqAll;

  let iq: number, eq: number, overall: number;

  if (evaluationType === 'iq') {
    // IQ 评估：主 IQ 分 = 全部题 IQ 均分，EQ 仅供参考
    iq = avgIqAll;
    eq = avgEqHy;
    overall = Math.round(iq * 0.7 + eq * 0.3);
  } else if (evaluationType === 'eq') {
    // EQ 评估：主 EQ 分 = 全部题 EQ 均分，IQ 仅供参考
    iq = avgIqHy;
    eq = avgEqAll;
    overall = Math.round(iq * 0.3 + eq * 0.7);
  } else {
    // 综合评估
    iq = avgIqAll;
    eq = avgEqAll;
    overall = Math.round(iq * 0.55 + eq * 0.45);
  }

  return { iq, eq, overall, details: scored };
}

/**
 * 计算雷达图六维度分数
 *
 * 维度定义：
 * - 逻辑推理：IQ 维度题目的 IQ 均分
 * - 抽象建模：Level 3 IQ 题目的 IQ 均分（高阶推理能力）
 * - 共情理解：EQ 维度题目的 EQ 均分
 * - 情绪调节：Level 3 EQ 题目的 EQ 均分（高阶情绪能力）
 * - 综合判断：hybrid 题目的 IQ 均分
 * - 综合决策：hybrid 题目的 EQ 均分
 */
export interface RadarDimensions {
  逻辑推理: number;
  抽象建模: number;
  共情理解: number;
  情绪调节: number;
  综合判断: number;
  综合决策: number;
}

export function computeRadarDimensions(
  questions: EvaluationQuestion[],
  answers: EvaluationAnswer[]
): RadarDimensions {
  const getScore = (q: EvaluationQuestion): { iq: number; eq: number } => {
    const a = answers.find((item) => item.questionId === q.id);
    return { iq: a?.scoreIq ?? 0, eq: a?.scoreEq ?? 0 };
  };

  const iqQuestions = questions.filter((q) => q.dimension === 'iq');
  const iqL3Questions = iqQuestions.filter((q) => q.difficulty >= 4);
  const eqQuestions = questions.filter((q) => q.dimension === 'eq');
  const eqL3Questions = eqQuestions.filter((q) => q.difficulty >= 4);
  const hyQuestions = questions.filter((q) => q.dimension === 'hybrid');

  const avgIq = (qs: EvaluationQuestion[], field: 'iq' | 'eq') =>
    qs.length > 0 ? Math.round(qs.reduce((s, q) => s + getScore(q)[field], 0) / qs.length) : 0;

  return {
    逻辑推理: avgIq(iqQuestions, 'iq'),
    抽象建模: iqL3Questions.length > 0 ? avgIq(iqL3Questions, 'iq') : avgIq(iqQuestions, 'iq'),
    共情理解: avgIq(eqQuestions, 'eq'),
    情绪调节: eqL3Questions.length > 0 ? avgIq(eqL3Questions, 'eq') : avgIq(eqQuestions, 'eq'),
    综合判断: avgIq(hyQuestions, 'iq'),
    综合决策: avgIq(hyQuestions, 'eq')
  };
}

function buildConclusion(score: EvaluationScore, evaluationType: EvaluationType): string {
  if (evaluationType === 'iq') {
    if (score.iq >= 85) return '该 AI 在逻辑推理、抽象建模和问题分析方面表现出色，具备极强的复杂推理能力。';
    if (score.iq >= 70) return '该 AI 具有优秀的逻辑推理能力，在 IQ 相关维度表现良好。';
    if (score.iq >= 55) return '该 AI 具有基本的逻辑推理能力，但在复杂推理场景中仍有提升空间。';
    return '该 AI 的逻辑推理能力需要进一步优化，建议加强分析、推理和抽象建模训练。';
  }
  if (evaluationType === 'eq') {
    if (score.eq >= 85) return '该 AI 在共情理解、情绪调节和人际互动方面表现出色，具备极强的情感智能。';
    if (score.eq >= 70) return '该 AI 具有优秀的情绪感知与回应能力，在 EQ 相关维度表现良好。';
    if (score.eq >= 55) return '该 AI 具有基本的共情与情绪应对能力，但在细腻情感处理上仍有提升空间。';
    return '该 AI 的情绪理解和回应能力需要进一步优化，建议加强共情、情绪调节训练。';
  }
  // 综合评估
  if (score.overall >= 85) {
    return '该 AI 在逻辑推理与情绪回应上表现出色，具备极强的复杂交互能力，适用于需要深度理解和共情的高级场景。';
  }
  if (score.overall >= 70) {
    return '该 AI 具有优秀的综合能力，在推理和情感维度表现均衡，适合大多数交互场景。';
  }
  if (score.overall >= 55) {
    return '该 AI 具有可用的综合能力，但在深层情绪理解或复杂推理中仍有提升空间。';
  }
  return '该 AI 需要进一步优化回答质量、稳定性与情绪表达，目前仅适合基础交互场景。';
}

function buildReport(
  userId: string,
  evaluationType: EvaluationType,
  selectedQuestions: EvaluationQuestion[],
  answers: EvaluationAnswer[]
): EvaluationReport {
  const score = aggregateEvaluation(selectedQuestions, answers, evaluationType);

  return {
    userId,
    evaluationType,
    status: 'completed',
    selectedQuestions,
    answers,
    score,
    conclusion: buildConclusion(score, evaluationType),
    createdAt: new Date().toISOString()
  };
}

// ========== 同步报告生成 ==========

export function generateEvaluationReport(
  userId: string,
  evaluationType: EvaluationType,
  answers = sampleEvaluationAnswers
): EvaluationReport {
  const selectedQuestions = pickQuestions(evaluationType);
  return buildReport(userId, evaluationType, selectedQuestions, answers);
}

// ========== 异步 Supabase 报告生成 ==========

export async function generateEvaluationReportFromSupabase(
  userId: string,
  evaluationType: EvaluationType,
  answers: EvaluationAnswer[] = sampleEvaluationAnswers as EvaluationAnswer[],
  options: { allowFallback?: boolean } = {}
) {
  const allowFallback = options.allowFallback ?? true;
  const profile = await readOrFallbackUserProfile(userId);
  const databaseQuestions = await readEvaluationQuestions(evaluationType);
  const selectedQuestions = databaseQuestions.length > 0 ? databaseQuestions : pickQuestions(evaluationType);

  if (!profile && !allowFallback) {
    return null;
  }

  const report = buildReport(userId, evaluationType, selectedQuestions, answers);

  if (!profile) {
    return report;
  }

  const session = await writeEvaluationSession({
    userId,
    evaluationType,
    status: 'completed',
    scoreIq: report.score.iq,
    scoreEq: report.score.eq,
    scoreOverall: report.score.overall,
    reportJson: report
  });

  if (session) {
    await writeEvaluationAnswers({
      sessionId: session.id,
      answers: selectedQuestions.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        const text = answer?.answer ?? '';
        const s = answer?.scoreIq !== undefined
          ? { iq: answer.scoreIq, eq: answer.scoreEq ?? 0 }
          : scoreAnswer(question, text);

        return {
          session_id: session.id,
          question_id: question.id,
          answer: text,
          score_iq: s.iq,
          score_eq: s.eq
        };
      })
    });

    return {
      ...report,
      sessionId: session.id
    };
  }

  return report;
}
