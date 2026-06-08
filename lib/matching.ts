/*
 * ==========================================================================
 * 匹配引擎 — 对应 UML 活动图 & 顺序图
 * ==========================================================================
 * 父活动图 (HuaqingMatchingParentActivityUML.txt):
 *   SubmitMatchRequest → ProcessMatchRequest → ObtainQuestionaryInformation →
 *   ProvideQuestionnaire → SubmitAnswers → BuildUserProfile →
 *   GetAIPartnerInformation → [匹配算法子活动] → ReturnMatchingReport
 *
 * 子活动图 (HuaqingMatchingChildActivityUML.txt):
 *   ReceiveProfile → 并行计算兴趣/人格/情绪兼容度 →
 *   AggregateScores → SortByTotal → ReturnResult
 *
 * 顺序图 (华清池AI伴侣匹配.txt):
 *   User → MatchingController → ProfileBuilder → MatchingEngine →
 *   UserQuestionaryDatabase → ImperialConcubineDatabase
 *
 * 状态图 (华清池AI伴侣匹配状态图UML.txt):
 *   详见 types.ts 中的 MatchingStatus 状态机映射
 * ==========================================================================
 */

import { aiCandidates, sampleMatchingAnswers } from './mock-data';
import { readAiCandidates, readOrFallbackUserProfile, writeMatchingSession } from './supabase';
import type {
  CandidateAI,
  CandidateMatchResult,
  MatchPreference,
  MatchingReport,
  MatchingStatus,
  MatchingTask,
  QuestionnaireQuestion
} from './types';

// ========== 问卷题库 (对应 UML: UserQuestionaryDatabase) ==========

export const matchingQuestionnaire: QuestionnaireQuestion[] = [
  {
    id: 'interest-1',
    type: 'interests',
    question: '你平时更倾向于阅读哪类内容？',
    options: ['文学作品', '科技资讯', '心理读物', '艺术鉴赏', '生活故事'],
    multiple: true
  },
  {
    id: 'interest-2',
    type: 'interests',
    question: '你喜欢的休闲方式是什么？',
    options: ['安静独处阅读', '创意手工绘画', '数据分析解谜', '社交聊天', '户外探索'],
    multiple: true
  },
  {
    id: 'personality-1',
    type: 'personality',
    question: '你希望伴侣的性格偏向？',
    options: ['温柔体贴', '理性果断', '活泼开朗', '沉稳可靠', '幽默风趣'],
    multiple: false
  },
  {
    id: 'personality-2',
    type: 'personality',
    question: '当遇到分歧时，你倾向于？',
    options: ['耐心沟通', '冷静分析', '包容退让', '坚持己见', '寻求折中'],
    multiple: false
  },
  {
    id: 'needs-1',
    type: 'needs',
    question: '你最看重伴侣的哪种情绪特质？',
    options: ['共情理解', '情绪稳定', '鼓励支持', '耐心倾听', '幽默陪伴'],
    multiple: true
  },
  {
    id: 'needs-2',
    type: 'needs',
    question: '你希望在与伴侣交流中获得什么？',
    options: ['情感安抚', '知识启发', '生活陪伴', '深度共鸣', '轻松愉快'],
    multiple: true
  },
  {
    id: 'open-1',
    type: 'open',
    question: '请用几个关键词描述你理想中的 AI 伴侣：',
    options: undefined,
    multiple: false
  }
];

// ========== 匹配任务工厂 (对应 UML: MatchingTask) ==========

export function createMatchingTask(userId: string): MatchingTask {
  return {
    id: `match-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    status: 'idle',
    questionnaireAnswers: {},
    createdAt: new Date().toISOString()
  };
}

// ========== 状态机转换 (对应 UML 状态图) ==========

export function transitionMatchingStatus(task: MatchingTask, status: MatchingStatus): MatchingTask {
  return { ...task, status, updatedAt: new Date().toISOString() };
}

export function markQuestionnairePending(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'questionnaire_pending');
}

export function markProfiling(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'profiling');
}

export function markCandidateRetrieval(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'candidate_retrieval');
}

export function markMatching(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'matching');
}

export function markDeliveringResult(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'delivering_result');
}

export function markMatchCompleted(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'completed');
}

export function markMatchCancelled(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'cancelled');
}

export function markMatchFailed(task: MatchingTask): MatchingTask {
  return transitionMatchingStatus(task, 'match_failed');
}

// ========== 工具函数 ==========

function normalizeList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

// ========== ProfileBuilder (对应 UML: ProfileBuilder) ==========

export function buildUserProfileFromAnswers(answers: Record<string, string[]>): MatchPreference {
  const interests: string[] = [];
  const personality: string[] = [];
  const needs: string[] = [];

  for (const [key, values] of Object.entries(answers)) {
    if (key.startsWith('interest-')) {
      interests.push(...values);
    } else if (key.startsWith('personality-')) {
      personality.push(...values);
    } else if (key.startsWith('needs-')) {
      needs.push(...values);
    }
  }

  return {
    interests: normalizeList(interests),
    personality: normalizeList(personality),
    needs: normalizeList(needs)
  };
}

export function buildUserProfile(input: Partial<MatchPreference> = {}): MatchPreference {
  return {
    interests: normalizeList(input.interests ?? sampleMatchingAnswers.interests),
    personality: normalizeList(input.personality ?? sampleMatchingAnswers.personality),
    needs: normalizeList(input.needs ?? sampleMatchingAnswers.needs)
  };
}

// ========== 标签映射表 (将用户答案映射到候选标签) ==========
// 用户问卷选项 → 候选 AI 标签的语义映射，解决精确匹配导致 0 分的问题

const ANSWER_TO_TAG_MAP: Record<string, string[]> = {
  // 兴趣维度映射
  '文学作品': ['文学', '故事', '阅读'],
  '科技资讯': ['科技', '算法', '工程', '数据分析'],
  '心理读物': ['心理', '生活建议', '共情'],
  '艺术鉴赏': ['艺术', '创意', '故事'],
  '生活故事': ['故事', '生活建议', '陪伴'],
  '安静独处阅读': ['文学', '阅读', '陪伴'],
  '创意手工绘画': ['艺术', '创意', '手工'],
  '数据分析解谜': ['数据分析', '算法', '逻辑', '工程'],
  '社交聊天': ['社交', '陪聊', '沟通'],
  '户外探索': ['探索', '冒险', '活跃'],
  // 人格维度映射
  '温柔体贴': ['温柔', '体贴', '共情', '安抚'],
  '理性果断': ['理性', '果断', '逻辑', '边界感'],
  '活泼开朗': ['活泼', '开朗', '陪聊', '鼓励'],
  '沉稳可靠': ['沉稳', '可靠', '稳定', '冷静'],
  '幽默风趣': ['幽默', '风趣', '陪聊'],
  '耐心沟通': ['耐心', '沟通', '倾听', '包容'],
  '冷静分析': ['冷静', '理性', '分析', '边界感'],
  '包容退让': ['包容', '退让', '共情', '安抚'],
  '坚持己见': ['坚持', '果断', '边界感'],
  '寻求折中': ['平衡', '折中', '沟通', '包容'],
  // 情绪需求维度映射
  '共情理解': ['共情', '理解', '倾听'],
  '情绪稳定': ['稳定', '冷静', '安抚'],
  '鼓励支持': ['鼓励', '支持', '陪伴'],
  '耐心倾听': ['耐心', '倾听', '共情'],
  '幽默陪伴': ['幽默', '陪伴', '陪聊'],
  '情感安抚': ['安抚', '共情', '温暖', '倾听'],
  '知识启发': ['知识', '启发', '分析', '逻辑'],
  '生活陪伴': ['生活建议', '陪伴', '陪聊'],
  '深度共鸣': ['共鸣', '共情', '理解'],
  '轻松愉快': ['轻松', '愉快', '陪聊', '幽默']
};

/**
 * 模糊匹配得分 (子串匹配 + 语义映射)
 * 对于 source 中的每一项，检查是否与 target 中任一项存在子串关系或映射关系
 * 返回匹配项数 (不是比例，后续归一化)
 */
function fuzzyScoreOverlap(source: string[], target: string[]): number {
  if (source.length === 0 || target.length === 0) return 0;
  let matchCount = 0;

  for (const srcItem of source) {
    // 1. 先检查映射表
    const mappedTags = ANSWER_TO_TAG_MAP[srcItem];
    if (mappedTags) {
      const mappedMatch = mappedTags.some((mapped) =>
        target.some((t) => t.includes(mapped) || mapped.includes(t))
      );
      if (mappedMatch) {
        matchCount += 1;
        continue;
      }
    }

    // 2. 直接子串匹配
    const directMatch = target.some(
      (t) => t.includes(srcItem) || srcItem.includes(t)
    );
    if (directMatch) {
      matchCount += 1;
      continue;
    }

    // 3. 单字符/双字符部分匹配 (兜底策略)
    const partialMatch = target.some((t) => {
      // 检查是否有至少2个共同字符
      const commonChars = [...srcItem].filter((c) => t.includes(c)).length;
      return commonChars >= 2;
    });
    if (partialMatch) {
      matchCount += 0.5; // 部分匹配给半分
    }
  }

  return matchCount;
}

export function calculateCompatibility(profile: MatchPreference, candidate: CandidateAI): CandidateMatchResult {
  const maxInterestScore = 25;
  const maxPersonalityScore = 25;
  const maxEmotionScore = 25;
  const maxCapabilityScore = 25;

  // 使用模糊匹配替代精确匹配
  const interestMatchCount = fuzzyScoreOverlap(profile.interests, candidate.interestTags);
  const personalityMatchCount = fuzzyScoreOverlap(profile.personality, candidate.personalityTags);
  const emotionMatchCount = fuzzyScoreOverlap(profile.needs, candidate.emotionTags);

  const interestRatio = profile.interests.length > 0
    ? Math.min(1, interestMatchCount / profile.interests.length)
    : 0;
  const personalityRatio = profile.personality.length > 0
    ? Math.min(1, personalityMatchCount / profile.personality.length)
    : 0;
  const emotionRatio = profile.needs.length > 0
    ? Math.min(1, emotionMatchCount / profile.needs.length)
    : 0;

  const interestScore = Math.round(interestRatio * maxInterestScore);
  const personalityScore = Math.round(personalityRatio * maxPersonalityScore);
  const emotionScore = Math.round(emotionRatio * maxEmotionScore);
  // 能力评分基于候选AI的capabilityScore (0-100)，权重25
  const capabilityScore = Math.round((candidate.capabilityScore / 100) * maxCapabilityScore);

  const compatibility = Math.min(100, interestScore + personalityScore + emotionScore + capabilityScore);

  const reasons = [];
  if (interestRatio > 0.6) reasons.push('兴趣高度契合');
  else if (interestRatio > 0.3) reasons.push('有一定的兴趣交集');
  else if (interestRatio > 0) reasons.push('兴趣领域值得探索');
  else reasons.push('兴趣领域需要更多探索');

  if (personalityRatio > 0.6) reasons.push('人格风格非常匹配');
  else if (personalityRatio > 0.3) reasons.push('人格风格有互补空间');
  else if (personalityRatio > 0) reasons.push('人格风格差异较大但可互补');
  else reasons.push('人格风格差异明显');

  if (emotionRatio > 0.6) reasons.push('情绪需求得到良好回应');
  else if (emotionRatio > 0.3) reasons.push('情绪需求部分可满足');
  else if (emotionRatio > 0) reasons.push('情绪需求需进一步磨合');
  else reasons.push('情绪需求差异较大');

  return {
    candidate,
    compatibility,
    interestScore,
    personalityScore,
    emotionScore,
    capabilityScore,
    reasons
  };
}

export function rankCandidates(profile: MatchPreference, candidates = aiCandidates): CandidateMatchResult[] {
  return candidates
    .map((candidate) => calculateCompatibility(profile, candidate))
    .sort((left, right) => right.compatibility - left.compatibility);
}

// ========== 报告生成 ==========

export function generateMatchingReport(userId: string, profileInput: Partial<MatchPreference> = {}): MatchingReport {
  const profile = buildUserProfile(profileInput);
  const rankedCandidates = rankCandidates(profile);

  return {
    userId,
    status: rankedCandidates.length > 0 ? 'completed' : 'match_failed',
    profile,
    rankedCandidates,
    summary: buildMatchingSummary(rankedCandidates),
    createdAt: new Date().toISOString()
  };
}

function buildMatchingSummary(ranked: CandidateMatchResult[]): string {
  if (ranked.length === 0) return '当前没有可用候选 AI。';

  const top = ranked[0];
  return `已生成 ${ranked.length} 个候选 AI 的匹配排序结果。最推荐 ${top.candidate.name}，综合兼容度 ${top.compatibility}%，在兴趣、人格和情绪维度均表现良好。`;
}

// ========== 匹配雷达图数据 ==========

/** 匹配结果雷达图维度 */
export interface MatchingRadarDimensions {
  兴趣匹配: number;
  人格匹配: number;
  情绪适配: number;
  能力评分: number;
  逻辑推理: number;
  共情能力: number;
}

/**
 * 为匹配结果计算雷达图六维度分数
 * 将匹配维度的原始分数映射到0-100范围
 */
export function computeMatchingRadar(result: CandidateMatchResult): MatchingRadarDimensions {
  const maxPerDim = 25; // 每个维度满分25

  return {
    兴趣匹配: Math.round((result.interestScore / maxPerDim) * 100),
    人格匹配: Math.round((result.personalityScore / maxPerDim) * 100),
    情绪适配: Math.round((result.emotionScore / maxPerDim) * 100),
    能力评分: Math.round((result.capabilityScore / maxPerDim) * 100),
    // 逻辑推理和共情能力基于 capabilityScore 拆分估算
    逻辑推理: Math.round((result.capabilityScore / maxPerDim) * 100 * 0.55),
    共情能力: Math.round((result.capabilityScore / maxPerDim) * 100 * 0.45)
  };
}

// ========== 异步 Supabase 报告生成 ==========

export async function generateMatchingReportFromSupabase(
  userId: string,
  profileInput: Partial<MatchPreference> = {},
  options: { allowFallback?: boolean } = {}
) {
  const allowFallback = options.allowFallback ?? true;
  const profileRecord = await readOrFallbackUserProfile(userId);
  const profile = buildUserProfile(profileInput);
  const databaseCandidates = await readAiCandidates();
  const candidates = databaseCandidates.length > 0 ? databaseCandidates : aiCandidates;
  const rankedCandidates = rankCandidates(profile, candidates);

  if (!profileRecord && !allowFallback) {
    return null;
  }

  const report: MatchingReport = {
    userId,
    status: rankedCandidates.length > 0 ? 'completed' : 'match_failed',
    profile,
    rankedCandidates,
    summary: buildMatchingSummary(rankedCandidates),
    createdAt: new Date().toISOString()
  };

  if (!profileRecord) {
    return report;
  }

  const session = await writeMatchingSession({
    userId,
    status: report.status,
    profileJson: profile,
    resultJson: report
  });

  if (session) {
    return {
      ...report,
      sessionId: session.id
    };
  }

  return report;
}
