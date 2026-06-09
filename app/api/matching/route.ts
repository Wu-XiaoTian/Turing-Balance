import { generateMatchingReportFromSupabase, rankCandidates, buildUserProfileFromAnswers } from '@/lib/matching';
import { writeMatchingSession } from '@/lib/supabase';
import { aiCandidates } from '@/lib/mock-data';
import type { MatchPreference, CandidateMatchResult } from '@/lib/types';

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
    rankedCandidates?: CandidateMatchResult[];
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

  // 持久化已完成的匹配结果到数据库 (客户端无权直接访问 service_role_key)
  if (body.action === 'complete' && body.userId && body.profile && body.rankedCandidates) {
    try {
      const session = await writeMatchingSession({
        userId: body.userId,
        status: body.rankedCandidates.length > 0 ? 'completed' : 'match_failed',
        profileJson: body.profile,
        resultJson: {
          profile: body.profile,
          rankedCandidates: body.rankedCandidates,
        }
      });

      if (session) {
        return Response.json({ ok: true, sessionId: session.id });
      }
      return Response.json({ ok: false, error: '数据库写入返回空。' }, { status: 500 });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
  }

  // 完成匹配并保存 (对应 UML: ReturnMatchingReport)
  const report = await generateMatchingReportFromSupabase(
    body.userId ?? 'demo-user',
    body.profile ?? {},
    { allowFallback: true }
  );

  return Response.json({ ok: true, report });
}