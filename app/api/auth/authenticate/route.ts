import { NextResponse } from 'next/server';
import { readUserProfile } from '@/lib/supabase';

/**
 * 根据用户 ID 获取认证用户信息
 * 对应 UML: LoginManager 查询用户
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  
  if (!body.userId) {
    return NextResponse.json({ ok: false, error: '需要提供用户 ID。' }, { status: 400 });
  }

  const profile = await readUserProfile(body.userId);

  if (!profile) {
    return NextResponse.json({ ok: false, error: '用户不存在。' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      lastLoginAt: profile.last_login_at
    }
  });
}
