import { generateMatchingReportFromSupabase, rankCandidates, buildUserProfileFromAnswers } from '@/lib/matching';
import { aiCandidates } from '@/lib/mock-data';
import type { MatchPreference } from '@/lib/types';

/**
 * GET: 获取匹配结果或候选列表
 * 对应 UML: UserQuestionaryDatabase - ObtainQuestionaryInformation
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? 'demo-user';
  const action = url.searchParams.get('action');

  // 获取候选 AI 列表
  if (action === 'candidates') {
    return Response.json({ ok: true, candidates: aiCandidates });
  }

  // 获取默认报告
  const report = await generateMatchingReportFromSupabase(userId);
  return Response.json({ ok: true, report });
}

/**
 * POST: 提交匹配数据
 * 对应 UML: SubmitAnswers → ProcessAnswers → BuildUserProfile → ExecuteMatchingAlgorithm → ReturnMatchingReport
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    profile?: MatchPreference;
    answers?: Record<string, string[]>;
    action?: 'submit-answers' | 'complete';
  };

  // 从问卷答案构建画像并匹配 (对应 UML: ProcessAnswers → BuildUserProfile)
  if (body.action === 'submit-answers' && body.answers) {
    const profile = buildUserProfileFromAnswers(body.answers);
    const rankedCandidates = rankCandidates(profile);

    return Response.json({
      ok: true,
      profile,
      rankedCandidates,
      status: rankedCandidates.length > 0 ? 'completed' : 'match_failed'
    });
  }

  // 完成匹配并保存 (对应 UML: ReturnMatchingReport)
  const report = await generateMatchingReportFromSupabase(
    body.userId ?? 'demo-user',
    body.profile ?? {},
    { allowFallback: true }
  );

  return Response.json({ ok: true, report });
}