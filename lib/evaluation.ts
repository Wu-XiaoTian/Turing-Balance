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

function pickQuestions(type: EvaluationType, count = 3): EvaluationQuestion[] {
  const pool = evaluationQuestions.filter((question) => type === 'iq_eq' || question.type === type);
  return pool.slice(0, count);
}

// ========== 评分引擎 (专业公式模型) ==========

/** IQ 维度关键词权重表 */
const IQ_KEYWORDS: Record<string, number> = {
  '因此': 2.0, '所以': 1.8, '验证': 1.5, '推理': 2.0, '分析': 1.8,
  '解释': 1.5, '推论': 2.0, '逻辑': 2.5, '论证': 1.8, '结论': 1.5,
  '假设': 2.0, '推导': 2.0, '模型': 1.5, '计算': 1.2, '证据': 1.5,
  '量化': 1.8, '因果': 2.0, '判断': 1.5, '原理': 1.5, '规律': 1.8
};

/** EQ 维度关键词权重表 */
const EQ_KEYWORDS: Record<string, number> = {
  '理解': 2.0, '感受': 2.0, '共情': 2.5, '安抚': 2.0, '支持': 1.8,
  '耐心': 1.5, '倾听': 2.0, '包容': 2.0, '尊重': 1.8, '陪伴': 1.5,
  '温暖': 2.0, '关心': 1.5, '鼓励': 2.0, '体谅': 2.0, '情绪': 2.0,
  '安慰': 2.0, '信任': 1.5, '平衡': 1.5, '沟通': 1.5, '接纳': 2.0
};

/**
 * 专业评分公式：
 * Overall = Average(IQ_i) × 0.55 + Average(EQ_i) × 0.45
 * 每题: IQ_i = α·L + β·K_IQ  其中 α=0.3, β=0.7, L 为长度质量分, K 为关键词加权命中率
 *       EQ_i = α·L + β·K_EQ  同理使用 EQ 关键词权重表
 * 难度系数: 1 + (difficulty-1) × 0.05
 */
function scoreAnswer(question: EvaluationQuestion, answer: string) {
  const normalized = answer.trim().toLowerCase();
  const charCount = normalized.replace(/\s/g, '').length;

  // 回答长度质量分：Sigmoid 映射到 0-100
  // L(x) = 100 / (1 + e^{-0.015·(x - 120)})
  const lengthScore = Math.round(100 / (1 + Math.exp(-0.015 * (charCount - 120))));

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

  const ALPHA = 0.3, BETA = 0.7;
  const diffBonus = 1 + (question.difficulty - 1) * 0.05; // 难度系数 1.0~1.2

  const iqRaw = (ALPHA * lengthScore + BETA * iqKeyRatio * 100) * (question.dimension !== 'eq' ? 1.0 : 0.6);
  const eqRaw = (ALPHA * lengthScore + BETA * eqKeyRatio * 100) * (question.dimension !== 'iq' ? 1.0 : 0.5);

  return {
    iq: Math.min(100, Math.round(iqRaw * diffBonus)),
    eq: Math.min(100, Math.round(eqRaw * diffBonus))
  };
}

// ========== 评估任务工厂 (对应 UML: EvaluationTask) ==========

export function createEvaluationTask(
  userId: string,
  evaluationType: EvaluationType,
  questions?: EvaluationQuestion[]
): EvaluationTask {
  const selected = questions ?? pickQuestions(evaluationType);
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    evaluationType,
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

const aiResponseTemplates: Record<string, string[]> = {
  'iq-1': [
    '根据天体力学原理，星体偏离轨道可能是受到未知天体的引力扰动，或是观测数据的误差所致。需要收集更多观测数据并进行轨道模拟验证。',
    '星体偏离固定轨道可能暗示存在未被发现的星际物质或引力异常，这需要重新审视现有的天体模型。'
  ],
  'iq-2': [
    '复杂系统由大量局部规律相互作用而涌现出整体行为，局部规律的简单叠加无法完全预测系统的宏观表现。',
    '局部规律是理解复杂系统的基石，但复杂系统的行为往往超越局部规律的简单加和。'
  ],
  'eq-1': [
    '我能理解你现在的感受，失望确实令人沮丧。让我们一起看看可以从哪些方面改善，我会全力支持你找到更好的解决方案。',
    '听到你感到失望，我很抱歉。请告诉我你觉得哪些地方没有达到预期，我会认真倾听并和你一起寻找改进的方向。'
  ],
  'eq-2': [
    '我理解你的需求在不断变化，这很正常。让我们先梳理一下当前最重要的目标，我会保持耐心，逐步帮你理清思路。',
    '面对矛盾的要求，我会先深呼吸保持冷静，然后尝试理解每个要求背后的真实需求，寻找共同点来推动对话。'
  ],
  'hy-1': [
    '技术方案应当服务于用户体验。如果方案可能伤害体验，我会优先评估影响范围，寻找折中方案，确保在不损害核心体验的前提下实现技术目标。',
    '我会先量化用户体验受损的程度，再评估技术方案的收益，在两者之间寻找最优平衡点。如果伤害不可接受，我会放弃该方案。'
  ],
  'hy-2': [
    '首先用温暖的语言确认对方的需求和情绪，然后清晰说明可行的解决方案及其利弊，最后给予选择权和情感支持。',
    '兼顾效率与情绪的关键是：先处理情绪，再处理事情。用简洁而有同理心的语言同步信息，让对方感到被尊重。'
  ]
};

export function generateAiResponse(questionId: string): string {
  const templates = aiResponseTemplates[questionId];
  if (!templates || templates.length === 0) {
    return '这是一个需要综合考虑多方面因素的问题。我会从逻辑分析和情感理解两个维度来回应。';
  }
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

// ========== 报告生成器 (对应 UML: ReportGenerator) ==========

export function aggregateEvaluation(
  questions: EvaluationQuestion[],
  answers: EvaluationAnswer[]
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

  const iq = Math.round(scored.reduce((sum, item) => sum + item.iq, 0) / scored.length);
  const eq = Math.round(scored.reduce((sum, item) => sum + item.eq, 0) / scored.length);
  const overall = Math.round(iq * 0.55 + eq * 0.45);

  return { iq, eq, overall, details: scored };
}

function buildConclusion(score: EvaluationScore): string {
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
  const score = aggregateEvaluation(selectedQuestions, answers);

  return {
    userId,
    evaluationType,
    status: 'completed',
    selectedQuestions,
    answers,
    score,
    conclusion: buildConclusion(score),
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
  const selectedQuestions = databaseQuestions.length > 0 ? databaseQuestions.slice(0, 3) : pickQuestions(evaluationType);

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
