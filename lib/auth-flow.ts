import {
  readUserProfile,
  registerSupabaseUser,
  signInSupabaseUser,
  touchUserLastLogin,
  type SupabaseAuthSession
} from '@/lib/supabase';

export type AuthMode = 'login' | 'register';

export interface AuthUserPayload {
  id: string;
  email: string | null;
  phoneNumber?: string | null;
  username: string | null;
  role: 'user' | 'evaluator' | 'administrator';
  lastLoginAt: string | null;
}

export interface AuthResponsePayload {
  ok: boolean;
  mode: 'supabase';
  user?: AuthUserPayload;
  session?: SupabaseAuthSession;
  message?: string;
}

interface AuthRequestBody {
  mode?: AuthMode;
  username?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
}

function buildUserPayload(input: {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'evaluator' | 'administrator';
  lastLoginAt: string | null;
}): AuthUserPayload {
  return input;
}

export async function handleAuthRequest(request: Request, forcedMode?: AuthMode) {
  const body = (await request.json().catch(() => ({}))) as AuthRequestBody;
  const mode = forcedMode ?? body.mode ?? 'login';

  if (mode === 'register') {
    if (!body.username || !body.email || !body.password) {
      return Response.json({ ok: false, mode: 'supabase', message: '用户名、邮箱和密码不能为空。' }, { status: 400 });
    }

    const result = await registerSupabaseUser({
      username: body.username,
      email: body.email,
      password: body.password,
      phoneNumber: body.phoneNumber
    });

    if (result.error || !result.data) {
      const isDuplicate =
        result.error.includes('已被注册') ||
        result.error.includes('已被使用') ||
        result.error === '用户名或邮箱已存在。';
      const status = isDuplicate ? 409 : 500;
      return Response.json({ ok: false, mode: 'supabase', message: result.error ?? '注册失败，请稍后重试。' }, { status });
    }

    const loginResult = await signInSupabaseUser({ email: body.email, password: body.password });

    if (loginResult.error || !loginResult.data) {
      return Response.json({ ok: false, mode: 'supabase', message: loginResult.error ?? '注册成功，但自动登录失败，请前往登录页登录。' }, { status: 401 });
    }

    return Response.json({
      ok: true,
      mode: 'supabase',
      user: buildUserPayload({
        id: result.data.id,
        email: result.data.email,
        username: result.data.username,
        role: result.data.role,
        lastLoginAt: null
      }),
      session: loginResult.data
    } satisfies AuthResponsePayload);
  }

  // 登录: 支持邮箱或手机号
  const identifier = body.email || body.phoneNumber;
  if (!identifier || !body.password) {
    return Response.json({ ok: false, mode: 'supabase', message: '邮箱/手机号和密码不能为空。' }, { status: 400 });
  }

  const loginInput = body.email
    ? { email: body.email, password: body.password }
    : { phone: body.phoneNumber!, password: body.password };

  const result = await signInSupabaseUser(loginInput);

  if (result.error || !result.data?.user) {
    return Response.json({ ok: false, mode: 'supabase', message: result.error ?? '登录失败。' }, { status: 401 });
  }

  const profile = await readUserProfile(result.data.user.id);

  if (profile) {
    const lastLoginResult = await touchUserLastLogin(result.data.user.id);
    if (lastLoginResult.error) {
      return Response.json({ ok: false, mode: 'supabase', message: lastLoginResult.error }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    mode: 'supabase',
    user: {
      id: result.data.user.id,
      email: result.data.user.email,
      phoneNumber: result.data.user.phone ?? null,
      username: profile?.username ?? result.data.user.user_metadata?.username ?? null,
      role: profile?.role ?? 'user',
      lastLoginAt: profile?.last_login_at ?? null
    },
    session: result.data
  } satisfies AuthResponsePayload);
}