import { registerSupabaseUser, signInSupabaseUser } from '@/lib/supabase';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    password?: string;
  };

  if (!body.username || !body.email || !body.password) {
    return Response.json({ ok: false, message: '用户名、邮箱和密码不能为空。' }, { status: 400 });
  }

  const result = await registerSupabaseUser({ username: body.username, email: body.email, password: body.password });

  if (result.error || !result.data) {
    const status = result.error === '用户名或邮箱已存在。' ? 409 : 500;
    return Response.json({ ok: false, message: result.error ?? '注册失败。' }, { status });
  }

  const loginResult = await signInSupabaseUser({ email: body.email, password: body.password });

  if (loginResult.error || !loginResult.data) {
    return Response.json({ ok: false, message: loginResult.error ?? '自动登录失败。' }, { status: 500 });
  }

  return Response.json({
    ok: true,
    mode: 'supabase',
    user: result.data,
    session: loginResult.data
  });
}