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
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}
