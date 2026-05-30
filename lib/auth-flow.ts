/*
 * ==========================================================================
 * 认证流程处理 — 对应 UML 类图 (类图UML.txt)
 * ==========================================================================
 * 核心类映射:
 *   LoginManager          → handleAuthRequest (login 分支)
 *   RegistrationManager   → handleAuthRequest (register 分支)
 *   EvaluatorLib           → (评估者资格校验)
 *   LoginUI / RegistrationUI → AuthPanel 组件
 *
 * 流程:
 *   注册: 用户提交信息 → RegistrationManager封装请求 → 查重检测 →
 *         Supabase Auth创建账号 → 自动登录
 *   登录: 用户提交凭证 → LoginManager格式校验 → Supabase Auth身份核验 →
 *         读取用户资料 → 更新登录记录 → 返回登录态
 * ==========================================================================
 */

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
      password: body.password
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

  // 登录: 仅支持邮箱
  if (!body.email || !body.password) {
    return Response.json({ ok: false, mode: 'supabase', message: '邮箱和密码不能为空。' }, { status: 400 });
  }

  const result = await signInSupabaseUser({ email: body.email, password: body.password });

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
      username: profile?.username ?? result.data.user.user_metadata?.username ?? null,
      role: profile?.role ?? 'user',
      lastLoginAt: profile?.last_login_at ?? null
    },
    session: result.data
  } satisfies AuthResponsePayload);
}