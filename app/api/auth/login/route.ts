import { readUserProfile, signInSupabaseUser, touchUserLastLogin } from '@/lib/supabase';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return Response.json({ ok: false, message: '邮箱和密码不能为空。' }, { status: 400 });
  }

  const result = await signInSupabaseUser({ email: body.email, password: body.password });

  if (result.error || !result.data?.user) {
    return Response.json({ ok: false, message: result.error ?? '登录失败。' }, { status: 401 });
  }

  const profile = await readUserProfile(result.data.user.id);
  const lastLoginResult = await touchUserLastLogin(result.data.user.id);

  if (lastLoginResult.error) {
    return Response.json({ ok: false, message: lastLoginResult.error }, { status: 500 });
  }

  return Response.json({
    ok: true,
    mode: 'supabase',
    user: {
      id: result.data.user.id,
      email: result.data.user.email,
      username: profile?.username ?? result.data.user.user_metadata?.username ?? null,
      role: profile?.role ?? 'user',
      lastLoginAt: profile?.last_login_at ?? null
    },
    session: result.data
  });
}