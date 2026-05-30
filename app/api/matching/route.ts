import { generateMatchingReportFromSupabase } from '@/lib/matching';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? 'demo-user';

  const report = await generateMatchingReportFromSupabase(userId);

  return Response.json({
    ok: true,
    report
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    profile?: Partial<{ interests: string[]; personality: string[]; needs: string[] }>;
  };

  const report = await generateMatchingReportFromSupabase(body.userId ?? 'demo-user', body.profile, {
    allowFallback: true
  });

  return Response.json({
    ok: true,
    report
  });
}