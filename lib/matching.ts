import { aiCandidates, sampleMatchingAnswers } from './mock-data';
import { readAiCandidates, readOrFallbackUserProfile, writeMatchingSession } from './supabase';
import type {
  CandidateAI,
  CandidateMatchResult,
  MatchPreference,
  MatchingReport
} from './types';

function normalizeList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function buildUserProfile(input: Partial<MatchPreference> = {}): MatchPreference {
  return {
    interests: normalizeList(input.interests ?? sampleMatchingAnswers.interests),
    personality: normalizeList(input.personality ?? sampleMatchingAnswers.personality),
    needs: normalizeList(input.needs ?? sampleMatchingAnswers.needs)
  };
}

function scoreOverlap(source: string[], target: string[]) {
  return source.reduce((total, item) => total + (target.includes(item) ? 1 : 0), 0);
}

export function calculateCompatibility(profile: MatchPreference, candidate: CandidateAI): CandidateMatchResult {
  const interestScore = scoreOverlap(profile.interests, candidate.interestTags) * 26;
  const personalityScore = scoreOverlap(profile.personality, candidate.personalityTags) * 24;
  const emotionScore = scoreOverlap(profile.needs, candidate.emotionTags) * 28;
  const capabilityScore = Math.round(candidate.capabilityScore * 0.22);

  const compatibility = Math.min(100, interestScore + personalityScore + emotionScore + capabilityScore);
  const reasons = [
    interestScore > 0 ? '兴趣标签匹配' : '兴趣标签相对分散',
    personalityScore > 0 ? '人格风格较一致' : '人格风格差异明显',
    emotionScore > 0 ? '情绪需求得到回应' : '情绪需求需进一步适配'
  ];

  return { candidate, compatibility, reasons };
}

export function rankCandidates(profile: MatchPreference, candidates = aiCandidates): CandidateMatchResult[] {
  return candidates
    .map((candidate) => calculateCompatibility(profile, candidate))
    .sort((left, right) => right.compatibility - left.compatibility);
}

export function generateMatchingReport(userId: string, profileInput: Partial<MatchPreference> = {}): MatchingReport {
  const profile = buildUserProfile(profileInput);
  const rankedCandidates = rankCandidates(profile);

  return {
    userId,
    status: rankedCandidates.length > 0 ? 'completed' : 'match_failed',
    profile,
    rankedCandidates,
    summary:
      rankedCandidates.length > 0
        ? `已生成 ${rankedCandidates.length} 个候选 AI 的匹配排序结果。`
        : '当前没有可用候选 AI。'
  };
}

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
    summary:
      rankedCandidates.length > 0
        ? `已生成 ${rankedCandidates.length} 个候选 AI 的匹配排序结果。`
        : '当前没有可用候选 AI。'
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
