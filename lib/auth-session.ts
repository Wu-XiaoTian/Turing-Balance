/*
 * ==========================================================================
 * 客户端会话管理 — 对应 UML 类图中的 LoginManager.sessionMap
 * ==========================================================================
 * 使用 localStorage 持久化 Auth Session，支持:
 *   - readAuthSession: 读取当前登录态
 *   - writeAuthSession: 写入登录态 (登录/注册成功后调用)
 *   - clearAuthSession: 清除登录态 (登出时调用)
 * ==========================================================================
 */

export interface AuthSessionUser {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'evaluator' | 'administrator';
  lastLoginAt: string | null;
}

export interface AuthSessionState {
  user: AuthSessionUser;
  accessToken: string | null;
  refreshToken: string | null;
}

const SESSION_KEY = 'turing-balance-auth-session';

export function readAuthSession(): AuthSessionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSessionState;
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSessionState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('turing-auth-changed'));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('turing-auth-changed'));
}
