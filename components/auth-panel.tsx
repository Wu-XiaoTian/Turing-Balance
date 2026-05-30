"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { writeAuthSession } from '@/lib/auth-session';
import type { AuthMode } from '@/lib/auth-flow';

interface AuthPanelProps {
  mode: AuthMode;
}

type AuthResponse = {
  ok: boolean;
  message?: string;
  user?: {
    id: string;
    email: string | null;
    username: string | null;
    phoneNumber?: string | null;
    role: 'user' | 'evaluator' | 'administrator';
    lastLoginAt: string | null;
  };
  session?: {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string | null; phone?: string | null; user_metadata?: { username?: string } };
  };
};

export function AuthPanel({ mode }: AuthPanelProps) {
  const router = useRouter();
  const isLogin = mode === 'login';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const body: Record<string, string> = { mode };
      if (isLogin) {
        if (loginMethod === 'email') {
          body.email = email;
        } else {
          body.phoneNumber = phoneNumber;
        }
        body.password = password;
      } else {
        body.username = username;
        body.email = email;
        body.password = password;
      }

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = (await response.json()) as AuthResponse;

      if (data.ok && data.user) {
        writeAuthSession({
          user: data.user,
          accessToken: data.session?.access_token ?? null,
          refreshToken: data.session?.refresh_token ?? null
        });

        setMessage(isLogin ? '登录成功，已保存当前登录态。' : '注册成功，已自动登录。');
        router.push('/evaluation');
        return;
      }

      setMessage(data.message ?? (isLogin ? '登录失败。' : '注册失败。'));
    } catch {
      setMessage(isLogin ? '登录请求失败。' : '注册请求失败。');
    } finally {
      setLoading(false);
    }
  }

  const title = isLogin ? '登录' : '注册';
  const description = isLogin
    ? '对应 UML 中的 LoginManager、LoginUI 与 UserDatabase 交互流程。支持邮箱或手机号登录。'
    : '对应 UML 中的 RegistrationManager、RegistrationUI 和 IDCardServer/重复性校验逻辑。';
  const chipLabel = isLogin ? '认证 / 校验 / 会话' : '注册 / 查重 / 入库';
  const alternateHref = isLogin ? '/auth?mode=register' : '/auth?mode=login';
  const alternateLabel = isLogin ? '没有账号？去注册' : '已有账号？去登录';

  return (
    <main className="shell">
      <section className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="chip">{chipLabel}</span>
      </section>

      <section className="panel stack" style={{ maxWidth: 480, margin: '0 auto' }}>
        <form className="stack" onSubmit={handleSubmit}>
          {!isLogin ? (
            <label className="stack">
              <span>用户名</span>
              <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
          ) : null}

          {/* 登录方式切换 */}
          {isLogin && (
            <div className="stats" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className={loginMethod === 'email' ? 'button' : 'button-ghost'}
                onClick={() => setLoginMethod('email')}
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                邮箱登录
              </button>
              <button
                type="button"
                className={loginMethod === 'phone' ? 'button' : 'button-ghost'}
                onClick={() => setLoginMethod('phone')}
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                手机号登录
              </button>
            </div>
          )}

          {isLogin && loginMethod === 'email' ? (
            <label className="stack">
              <span>邮箱地址</span>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" />
            </label>
          ) : null}

          {isLogin && loginMethod === 'phone' ? (
            <label className="stack">
              <span>手机号码</span>
              <input className="field" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="13800138000" />
            </label>
          ) : null}

          {!isLogin ? (
            <label className="stack">
              <span>邮箱地址</span>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          ) : null}

          <label className="stack">
            <span>密码</span>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <button className="button" type="submit" disabled={loading} style={{ minHeight: 48, fontSize: '1.05rem' }}>
            {loading ? (isLogin ? '登录中...' : '注册中...') : isLogin ? '登录' : '注册'}
          </button>
        </form>

        {message ? (
          <p className="muted" style={{
            padding: 12, borderRadius: 12,
            background: message.includes('成功') ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${message.includes('成功') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: message.includes('成功') ? 'var(--success)' : 'var(--danger)'
          }}>
            {message}
          </p>
        ) : null}

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link className="nav-link" href={alternateHref}>
            {alternateLabel}
          </Link>
        </div>

        <div>
          <h2>流程</h2>
          <ol className="muted">
            {isLogin ? (
              <>
                <li>用户提交邮箱/手机号与密码。</li>
                <li>LoginManager 校验格式后调用 Supabase Auth 完成身份验证。</li>
                <li>读取 profiles 表返回用户资料，更新 last_login_at。</li>
                <li>登录态写入浏览器存储，跳转到评估页。</li>
              </>
            ) : (
              <>
                <li>用户提交用户名、邮箱和密码。</li>
                <li>RegistrationManager 进行重复性检测。</li>
                <li>通过后创建 Supabase Auth 用户，并写入 profiles 表。</li>
                <li>返回成功后自动写入浏览器登录态。</li>
              </>
            )}
          </ol>
        </div>
      </section>
    </main>
  );
}