/*
 * ==========================================================================
 * 认证 API — 对应 UML 类图: LoginManager / RegistrationManager
 * ==========================================================================
 * POST: 根据 mode 参数分发登录(LoginManager)或注册(RegistrationManager)流程
 * 注册: Username+Email+Password → 查重 → Supabase Auth Admin创建 → 自动登录
 * 登录: Email+Password → Supabase Auth Token验证 → 读取profiles表 → 更新last_login
 * ==========================================================================
 */

import { handleAuthRequest } from '@/lib/auth-flow';

export async function POST(request: Request) {
  return handleAuthRequest(request);
}