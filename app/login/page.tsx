"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { writeAuthSession } from '@/lib/auth-session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const requestBody = {
    email,
    password: '******'
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        user?: { id: string; email: string | null; username: string | null; role: 'user' | 'evaluator' | 'administrator'; lastLoginAt: string | null };
        session?: { access_token: string; refresh_token: string; user: { id: string; email: string | null; user_metadata?: { username?: string } } };
      };

      if (data.ok && data.user) {
        writeAuthSession({
          user: data.user,
          accessToken: data.session?.access_token ?? null,
          refreshToken: data.session?.refresh_token ?? null
        });
        setMessage('登录成功，已保存当前登录态。');
        router.push('/evaluation');
        return;
      }

      setMessage(data.message ?? '登录失败。');
    } catch {
      setMessage('登录请求失败。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="page-head">
        <div>
          <h1>登录模块</h1>
          <p>对应 UML 中的 LoginManager、LoginUI 与 UserDatabase 交互流程。</p>
        </div>
        <span className="chip">认证 / 校验 / 会话</span>
      </section>

      <section className="panel stack">
        <form className="stack" onSubmit={handleSubmit}>
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
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        {message ? <p className="muted">{message}</p> : null}

        <div>
          <h2>流程</h2>
          <ol className="muted">
            <li>用户提交邮箱与密码，邮箱可以是伪邮箱地址，不做格式验证。</li>
            <li>调用 Supabase Auth 完成身份验证，再读取 profiles 表返回用户资料。</li>
            <li>登录成功后更新 last_login_at 字段，并把当前登录态写入浏览器存储。</li>
          </ol>
        </div>

        <div>
          <h3>API 对接</h3>
          <pre className="code">POST /api/auth/login{`\n`}{JSON.stringify(requestBody, null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}