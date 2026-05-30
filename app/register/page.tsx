"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeAuthSession } from '@/lib/auth-session';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('user_a');
  const [email, setEmail] = useState('demo@local.test');
  const [password, setPassword] = useState('12345678');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const requestBody = {
    username,
    email,
    password: '******'
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      });

      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        user?: { id: string; username: string; email: string; role: 'user' | 'evaluator' | 'administrator' };
        session?: { access_token: string; refresh_token: string; user: { id: string; email: string | null; user_metadata?: { username?: string } } };
      };

      if (data.ok && data.user) {
        writeAuthSession({
          user: {
            id: data.user.id,
            email: data.user.email,
            username: data.user.username,
            role: data.user.role,
            lastLoginAt: null
          },
          accessToken: data.session?.access_token ?? null,
          refreshToken: data.session?.refresh_token ?? null
        });
        setMessage('注册成功，已自动登录。');
        router.push('/evaluation');
        return;
      }

      setMessage(data.message ?? '注册失败。');
    } catch {
      setMessage('注册请求失败。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="page-head">
        <div>
          <h1>注册模块</h1>
          <p>对应 UML 中的 RegistrationManager、RegistrationUI 和 IDCardServer/重复性校验逻辑。</p>
        </div>
        <span className="chip">注册 / 查重 / 入库</span>
      </section>

      <section className="panel stack">
        <form className="stack" onSubmit={handleSubmit}>
          <label className="stack">
            <span>用户名</span>
            <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>

          <label className="stack">
            <span>邮箱地址</span>
            <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="stack">
            <span>密码</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="button" type="submit" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        {message ? <p className="muted">{message}</p> : null}

        <div>
          <h2>流程</h2>
          <ol className="muted">
            <li>用户提交用户名、邮箱和密码，邮箱可以是伪邮箱地址，不做验证。</li>
            <li>系统进行格式校验与重复性检测。</li>
            <li>通过后创建 Supabase Auth 用户，并写入 profiles 表。</li>
            <li>返回成功后自动写入浏览器登录态。</li>
          </ol>
        </div>

        <div>
          <h3>API 对接</h3>
          <pre className="code">POST /api/auth/register{`\n`}{JSON.stringify(requestBody, null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}