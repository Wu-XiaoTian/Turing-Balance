"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { readAuthSession, clearAuthSession } from '@/lib/auth-session';
import type { SystemParameter } from '@/lib/types';

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState(() => readAuthSession());
  const [params, setParams] = useState<SystemParameter[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = readAuthSession();
    setSession(s);
    if (!s) {
      router.push('/auth?mode=login');
      return;
    }
    loadParams();
  }, [router]);

  async function loadParams() {
    try {
      const res = await fetch('/api/system-parameters');
      const data = await res.json();
      if (data.ok) setParams(data.parameters ?? []);
    } catch {
      // ignore
    }
  }

  async function addParameter() {
    if (!newKey || !newValue) return;
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/system-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey, value: newValue, description: newDesc })
      });
      const data = await res.json();
      if (data.ok) {
        setMessage('参数已添加。');
        setNewKey('');
        setNewValue('');
        setNewDesc('');
        await loadParams();
      } else {
        setMessage(data.error ?? '添加失败。');
      }
    } catch {
      setMessage('请求失败。');
    } finally {
      setLoading(false);
    }
  }

  async function deleteParameter(key: string) {
    try {
      const res = await fetch(`/api/system-parameters?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setMessage(`参数 "${key}" 已删除。`);
        await loadParams();
      } else {
        setMessage(data.error ?? '删除失败。');
      }
    } catch {
      setMessage('请求失败。');
    }
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="panel stack" style={{ textAlign: 'center', padding: 60 }}>
          <h2>需要管理员权限</h2>
          <p className="muted">请先登录后再访问管理页面。</p>
          <Link className="button" href="/auth?mode=login">去登录</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="page-head">
        <div>
          <h1>系统管理</h1>
          <p>管理系统参数配置与维护</p>
        </div>
        <div className="stats">
          <span className="chip">管理员: {session.user.username ?? session.user.email}</span>
        </div>
      </section>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 参数管理 */}
        <section className="panel stack">
          <h2>系统参数</h2>
          <p className="muted">配置评估阈值、匹配权重、报告模板等系统参数。</p>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {params.length === 0 ? (
              <p className="muted">暂无系统参数。</p>
            ) : (
              params.map((p) => (
                <div key={p.key} className="panel" style={{
                  padding: '12px 16px', marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <strong>{p.key}</strong>
                    <p className="muted" style={{ fontSize: '0.85rem', margin: '2px 0' }}>
                      值: {String(p.value)} {p.description ? `· ${p.description}` : ''}
                    </p>
                  </div>
                  <button
                    className="button-ghost"
                    style={{ color: 'var(--danger)', padding: '4px 12px', minHeight: 32 }}
                    onClick={() => deleteParameter(p.key)}
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
            <h3>添加参数</h3>
            <div className="stack" style={{ gap: 8 }}>
              <input className="field" placeholder="参数键名" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
              <input className="field" placeholder="参数值" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              <input className="field" placeholder="描述（选填）" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              <button className="button" onClick={addParameter} disabled={loading}>
                {loading ? '添加中...' : '添加参数'}
              </button>
            </div>
          </div>

          {message && <p className="muted">{message}</p>}
        </section>

        {/* 管理菜单 */}
        <section className="panel stack">
          <h2>管理菜单</h2>
          <p className="muted">系统功能入口</p>

          <div className="stack">
            <Link href="/evaluation" className="panel" style={{ padding: 16, textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>🧠 评估管理</h3>
                <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>查看评估任务、题库管理</p>
              </div>
              <span>→</span>
            </Link>

            <Link href="/matching" className="panel" style={{ padding: 16, textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>💞 匹配管理</h3>
                <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>查看匹配任务、候选 AI 管理</p>
              </div>
              <span>→</span>
            </Link>

            <div className="panel" style={{ padding: 16 }}>
              <h3 style={{ margin: 0 }}>📊 系统信息</h3>
              <div className="stats" style={{ marginTop: 8 }}>
                <span className="stat">参数数: {params.length}</span>
                <span className="stat">角色: {session.user.role}</span>
              </div>
            </div>

            <button
              className="button-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                clearAuthSession();
                router.push('/');
              }}
            >
              退出登录
            </button>

            <Link className="button-ghost" href="/">返回首页</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
