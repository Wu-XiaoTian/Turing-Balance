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

// ========== MatchingEngine (对应 UML: MatchingEngine) ==========

function scoreOverlap(source: string[], target: string[]) {
  if (source.length === 0) return 0;
  return source.reduce((total, item) => total + (target.includes(item) ? 1 : 0), 0);
}

export function calculateCompatibility(profile: MatchPreference, candidate: CandidateAI): CandidateMatchResult {
  const maxInterestScore = 30;
  const maxPersonalityScore = 28;
  const maxEmotionScore = 30;
  const maxCapabilityScore = 12;

  const interestRatio = profile.interests.length > 0
    ? scoreOverlap(profile.interests, candidate.interestTags) / profile.interests.length
    : 0;
  const personalityRatio = profile.personality.length > 0
    ? scoreOverlap(profile.personality, candidate.personalityTags) / profile.personality.length
    : 0;
  const emotionRatio = profile.needs.length > 0
    ? scoreOverlap(profile.needs, candidate.emotionTags) / profile.needs.length
    : 0;

  const interestScore = Math.round(interestRatio * maxInterestScore);
  const personalityScore = Math.round(personalityRatio * maxPersonalityScore);
  const emotionScore = Math.round(emotionRatio * maxEmotionScore);
  const capabilityScore = Math.round((candidate.capabilityScore / 100) * maxCapabilityScore);

  const compatibility = Math.min(100, interestScore + personalityScore + emotionScore + capabilityScore);

  const reasons = [];
  if (interestRatio > 0.5) reasons.push('兴趣高度契合');
  else if (interestRatio > 0) reasons.push('有一定的兴趣交集');
  else reasons.push('兴趣领域需要探索');

  if (personalityRatio > 0.5) reasons.push('人格风格非常匹配');
  else if (personalityRatio > 0) reasons.push('人格风格有互补空间');
  else reasons.push('人格风格差异较大');

  if (emotionRatio > 0.5) reasons.push('情绪需求得到良好回应');
  else if (emotionRatio > 0) reasons.push('情绪需求部分可满足');
  else reasons.push('情绪需求需进一步沟通');

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
