import { generateEvaluationReportFromSupabase } from '@/lib/evaluation';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? 'demo-user';
  const type = (url.searchParams.get('type') ?? 'iq_eq') as 'iq' | 'eq' | 'iq_eq';

  const report = await generateEvaluationReportFromSupabase(userId, type);

  return Response.json({
    ok: true,
    report
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    type?: 'iq' | 'eq' | 'iq_eq';
    answers?: { questionId: string; answer: string }[];
  };

  const report = await generateEvaluationReportFromSupabase(body.userId ?? 'demo-user', body.type ?? 'iq_eq', body.answers, {
    allowFallback: true
  });

  return Response.json({
    ok: true,
    report
  });
}