/*
 * ==========================================================================
 * 系统管理页面 — 管理员专属 (评估管理 / 匹配管理 / 系统信息)
 * ==========================================================================
 * Administrator "1" -- "*" SystemParameter : configure
 * 管理员通过此页面管理:
 *   1. 评估管理: 查看所有评估任务、题库管理
 *   2. 匹配管理: 查看所有匹配任务、候选 AI 管理
 *   3. 系统信息: 系统参数配置、系统状态监控
 * ==========================================================================
 */

"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { readAuthSession, clearAuthSession, type AuthSessionState } from '@/lib/auth-session';
import type { SystemParameter, EvaluationQuestion, CandidateAI } from '@/lib/types';

// ========== Tab 定义 ==========
type AdminTab = 'evaluation' | 'matching' | 'system';

// ========== 评估任务数据类型 (管理员视角) ==========
interface AdminEvalTask {
  id: string;
  userId: string;
  userName: string;
  type: string;
  modelId: string;
  status: string;
  score?: { iq: number; eq: number; overall: number };
  createdAt: string;
}

// ========== 匹配任务数据类型 (管理员视角) ==========
interface AdminMatchTask {
  id: string;
  userId: string;
  userName: string;
  status: string;
  topMatch?: string;
  topScore?: number;
  createdAt: string;
}

// ========== 状态中文映射 ==========
const STATUS_LABELS: Record<string, string> = {
  uninitialized: '未初始化',
  initializing: '初始化中',
  ready: '就绪',
  evaluating: '评估中',
  finalizing: '收尾中',
  completed: '已完成',
  cancelled: '已取消',
  aborted: '已中止',
  idle: '空闲',
  questionnaire_pending: '待填写问卷',
  profiling: '画像分析中',
  candidate_retrieval: '检索候选中',
  matching: '匹配计算中',
  delivering_result: '生成报告中',
  match_failed: '匹配失败',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--success)',
  evaluating: 'var(--accent-2)',
  profiling: 'var(--accent-2)',
  matching: 'var(--accent-2)',
  cancelled: 'var(--danger)',
  aborted: 'var(--danger)',
  match_failed: 'var(--danger)',
};

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('evaluation');

  // ---- 系统参数状态 ----
  const [params, setParams] = useState<SystemParameter[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ---- 评估管理状态 ----
  const [evalTasks, setEvalTasks] = useState<AdminEvalTask[]>([]);
  const [evalTasksLoading, setEvalTasksLoading] = useState(false);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ id: '', title: '', type: 'iq' as EvaluationQuestion['type'], dimension: 'iq' as EvaluationQuestion['dimension'], prompt: '', difficulty: 1 });

  // ---- 匹配管理状态 ----
  const [matchTasks, setMatchTasks] = useState<AdminMatchTask[]>([]);
  const [matchTasksLoading, setMatchTasksLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateAI[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ id: '', name: '', description: '', personalityTags: '', interestTags: '', emotionTags: '', capabilityScore: '5' });

  const isAdmin = session?.user?.role === 'administrator';

  // 初始化
  useEffect(() => {
    const s = readAuthSession();
    setSession(s);
    if (!s) {
      router.push('/auth?mode=login');
      return;
    }
    if (s.user.role !== 'administrator') {
      return;
    }
    // 加载数据
    loadParams();
    loadEvalTasks();
    loadQuestions();
    loadMatchTasks();
    loadCandidates();
  }, [router]);

  // ========== 系统参数 CRUD ==========

  async function loadParams() {
    try {
      const res = await fetch('/api/system-parameters');
      const data = await res.json();
      if (data.ok) setParams(data.parameters ?? []);
    } catch { /* ignore */ }
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
        setNewKey(''); setNewValue(''); setNewDesc('');
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
      if (data.ok) { setMessage(`参数 "${key}" 已删除。`); await loadParams(); }
      else { setMessage(data.error ?? '删除失败。'); }
    } catch { setMessage('请求失败。'); }
  }

  // ========== 数据加载函数 ==========

  async function loadEvalTasks() {
    setEvalTasksLoading(true);
    try {
      const res = await fetch('/api/admin/evaluation?action=tasks');
      const data = await res.json();
      if (data.ok) setEvalTasks(data.tasks ?? []);
    } catch { /* ignore */ }
    finally { setEvalTasksLoading(false); }
  }

  async function loadQuestions() {
    setQuestionsLoading(true);
    try {
      const res = await fetch('/api/admin/evaluation?action=questions');
      const data = await res.json();
      if (data.ok) setQuestions(data.questions ?? []);
    } catch { /* ignore */ }
    finally { setQuestionsLoading(false); }
  }

  async function loadMatchTasks() {
    setMatchTasksLoading(true);
    try {
      const res = await fetch('/api/admin/matching?action=tasks');
      const data = await res.json();
      if (data.ok) setMatchTasks(data.tasks ?? []);
    } catch { /* ignore */ }
    finally { setMatchTasksLoading(false); }
  }

  async function loadCandidates() {
    setCandidatesLoading(true);
    try {
      const res = await fetch('/api/admin/matching?action=candidates');
      const data = await res.json();
      if (data.ok) setCandidates(data.candidates ?? []);
    } catch { /* ignore */ }
    finally { setCandidatesLoading(false); }
  }

  // ========== 题库管理 (真实 API) ==========

  async function addQuestion() {
    if (!newQuestion.id || !newQuestion.title || !newQuestion.prompt) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-question', question: { ...newQuestion, sortOrder: questions.length + 1 } })
      });
      const data = await res.json();
      if (data.ok) {
        setMessage('题目已添加到数据库。');
        setNewQuestion({ id: '', title: '', type: 'iq', dimension: 'iq', prompt: '', difficulty: 1 });
        setShowAddQuestion(false);
        await loadQuestions();
      } else {
        setMessage(data.error ?? '添加失败。');
      }
    } catch {
      setMessage('请求失败。');
    } finally {
      setLoading(false);
    }
  }

  async function deleteQuestion(id: string) {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-question', taskId: id })
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`题目 "${id}" 已从数据库删除。`);
        await loadQuestions();
      } else {
        setMessage(data.error ?? '删除失败。');
      }
    } catch {
      setMessage('请求失败。');
    } finally {
      setLoading(false);
    }
  }

  // ========== 候选 AI 管理 (真实 API) ==========

  async function addCandidate() {
    if (!newCandidate.id || !newCandidate.name || !newCandidate.description) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert-candidate',
          candidate: {
            id: newCandidate.id,
            name: newCandidate.name,
            description: newCandidate.description,
            personalityTags: newCandidate.personalityTags.split(',').map((t) => t.trim()).filter(Boolean),
            interestTags: newCandidate.interestTags.split(',').map((t) => t.trim()).filter(Boolean),
            emotionTags: newCandidate.emotionTags.split(',').map((t) => t.trim()).filter(Boolean),
            capabilityScore: parseInt(newCandidate.capabilityScore) || 5,
          }
        })
      });
      const data = await res.json();
      if (data.ok) {
        setMessage('候选 AI 已添加到数据库。');
        setNewCandidate({ id: '', name: '', description: '', personalityTags: '', interestTags: '', emotionTags: '', capabilityScore: '5' });
        setShowAddCandidate(false);
        await loadCandidates();
      } else {
        setMessage(data.error ?? '添加失败。');
      }
    } catch {
      setMessage('请求失败。');
    } finally {
      setLoading(false);
    }
  }

  async function deleteCandidate(id: string) {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-candidate', taskId: id })
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`候选 AI "${id}" 已从数据库删除。`);
        await loadCandidates();
      } else {
        setMessage(data.error ?? '删除失败。');
      }
    } catch {
      setMessage('请求失败。');
    } finally {
      setLoading(false);
    }
  }

  // ========== 权限拦截 ==========
  if (!session) {
    return (
      <main className="shell">
        <section className="panel stack" style={{ textAlign: 'center', padding: 60 }}>
          <h2>需要登录</h2>
          <p className="muted">请先登录后再访问管理页面。</p>
          <Link className="button" href="/auth?mode=login">去登录</Link>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="shell">
        <section className="panel stack" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
          <h2>需要管理员权限</h2>
          <p className="muted">此页面仅限管理员访问。您当前的权限不足以查看管理内容。</p>
          <Link className="button" href="/">返回首页</Link>
        </section>
      </main>
    );
  }

  // ========== Tab 样式 ==========
  const tabBtnStyle = (tab: AdminTab) => ({
    padding: '10px 20px',
    border: 'none',
    borderRadius: 10,
    background: activeTab === tab ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
    color: activeTab === tab ? '#000' : 'var(--text)',
    fontWeight: activeTab === tab ? 700 : 400,
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  });

  // ========== 渲染 ==========
  return (
    <main className="shell">
      {/* 页头 */}
      <section className="page-head">
        <div>
          <h1>⚙️ 系统管理</h1>
          <p>评估管理 · 匹配管理 · 系统信息</p>
        </div>
        <div className="stats">
          <span className="chip">管理员: {session.user.username ?? session.user.email}</span>
          <button
            className="button-ghost"
            style={{ color: 'var(--danger)', marginLeft: 8 }}
            onClick={() => { clearAuthSession(); router.push('/'); }}
          >
            退出登录
          </button>
        </div>
      </section>

      {/* Tab 导航 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button style={tabBtnStyle('evaluation')} onClick={() => { setActiveTab('evaluation'); setMessage(''); }}>
          🧠 评估管理
        </button>
        <button style={tabBtnStyle('matching')} onClick={() => { setActiveTab('matching'); setMessage(''); }}>
          💞 匹配管理
        </button>
        <button style={tabBtnStyle('system')} onClick={() => { setActiveTab('system'); setMessage(''); }}>
          📊 系统信息
        </button>
      </div>

      {message && (
        <div className="panel" style={{ padding: '10px 16px', marginBottom: 16, borderColor: 'var(--accent)', background: 'rgba(245,158,11,0.08)' }}>
          <span style={{ fontSize: '0.9rem' }}>{message}</span>
          <button style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => setMessage('')}>✕</button>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: 评估管理 */}
      {/* ================================================================ */}
      {activeTab === 'evaluation' && (
        <div className="stack" style={{ gap: 24 }}>
          {/* 评估任务列表 */}
          <section className="panel stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>📋 评估任务列表</h2>
                <p className="muted">查看系统中所有用户的评估任务及状态（来自数据库）。</p>
              </div>
              <button className="button-ghost" onClick={loadEvalTasks} disabled={evalTasksLoading} style={{ fontSize: '0.8rem' }}>
                {evalTasksLoading ? '⏳ 加载中...' : '🔄 刷新'}
              </button>
            </div>
            {evalTasksLoading && evalTasks.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>加载评估任务中...</p>
            ) : evalTasks.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>暂无评估任务数据。用户完成评估后任务将显示在这里。</p>
            ) : (
            <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>任务ID</th>
                    <th style={{ padding: '8px 12px' }}>用户</th>
                    <th style={{ padding: '8px 12px' }}>评估类型</th>
                    <th style={{ padding: '8px 12px' }}>AI模型</th>
                    <th style={{ padding: '8px 12px' }}>状态</th>
                    <th style={{ padding: '8px 12px' }}>分数</th>
                    <th style={{ padding: '8px 12px' }}>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {evalTasks.map((task) => (
                    <tr key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{task.id}</td>
                      <td style={{ padding: '8px 12px' }}>{task.userName}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span className="chip" style={{ fontSize: '0.8rem' }}>
                          {task.type === 'iq_eq' ? '综合' : task.type === 'iq' ? 'IQ' : 'EQ'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.modelId}>
                        {task.modelId}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          color: STATUS_COLORS[task.status] ?? 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                        }}>
                          {STATUS_LABELS[task.status] ?? task.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {task.score ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            IQ:{task.score.iq} EQ:{task.score.eq} 总:{task.score.overall}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stats" style={{ marginTop: 8 }}>
              <span className="stat">总任务: {evalTasks.length}</span>
              <span className="stat">已完成: {evalTasks.filter((t) => t.status === 'completed').length}</span>
              <span className="stat">进行中: {evalTasks.filter((t) => t.status === 'evaluating').length}</span>
            </div>
            </>
            )}
          </section>

          {/* 题库管理 */}
          <section className="panel stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>📚 题库管理</h2>
                <p className="muted">管理评估题库（数据库，共 {questions.length} 题）</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button-ghost" onClick={loadQuestions} disabled={questionsLoading} style={{ fontSize: '0.8rem' }}>
                  {questionsLoading ? '⏳' : '🔄'}
                </button>
                <button className="button" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowAddQuestion(!showAddQuestion)}>
                  {showAddQuestion ? '取消' : '+ 添加题目'}
                </button>
              </div>
            </div>

            {/* 添加题目表单 */}
            {showAddQuestion && (
              <div className="panel" style={{ padding: 16, background: 'rgba(56,189,248,0.05)', borderColor: 'rgba(56,189,248,0.2)' }}>
                <h3>添加新题目</h3>
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="field" style={{ flex: 1 }} placeholder="题目ID (如 iq-l1-05)" value={newQuestion.id} onChange={(e) => setNewQuestion((p) => ({ ...p, id: e.target.value }))} />
                    <input className="field" style={{ flex: 2 }} placeholder="题目标题" value={newQuestion.title} onChange={(e) => setNewQuestion((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="field" style={{ flex: 1 }} value={newQuestion.type} onChange={(e) => setNewQuestion((p) => ({ ...p, type: e.target.value as EvaluationQuestion['type'] }))}>
                      <option value="iq">IQ 题</option>
                      <option value="eq">EQ 题</option>
                      <option value="iq_eq">综合题</option>
                    </select>
                    <select className="field" style={{ flex: 1 }} value={newQuestion.dimension} onChange={(e) => setNewQuestion((p) => ({ ...p, dimension: e.target.value as EvaluationQuestion['dimension'] }))}>
                      <option value="iq">IQ 维度</option>
                      <option value="eq">EQ 维度</option>
                      <option value="hybrid">综合维度</option>
                    </select>
                    <input className="field" style={{ width: 80 }} type="number" min={1} max={5} placeholder="难度" value={newQuestion.difficulty} onChange={(e) => setNewQuestion((p) => ({ ...p, difficulty: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <textarea className="field" rows={2} placeholder="题目内容 (prompt)" value={newQuestion.prompt} onChange={(e) => setNewQuestion((p) => ({ ...p, prompt: e.target.value }))} style={{ resize: 'vertical' }} />
                  <button className="button" onClick={addQuestion} style={{ alignSelf: 'flex-start' }}>确认添加</button>
                </div>
              </div>
            )}

            {/* 题目列表 */}
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {questions.slice(0, 20).map((q) => (
                <div key={q.id} className="panel" style={{
                  padding: '10px 14px', marginBottom: 6,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span className="chip" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        {q.type === 'iq_eq' ? '综合' : q.type.toUpperCase()}
                      </span>
                      <span className="chip" style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(56,189,248,0.15)', color: 'var(--accent-2)' }}>
                        难度 {q.difficulty}
                      </span>
                      <strong style={{ fontSize: '0.9rem' }}>{q.title}</strong>
                    </div>
                    <p className="muted" style={{ fontSize: '0.8rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {q.prompt}
                    </p>
                  </div>
                  <button
                    className="button-ghost"
                    style={{ color: 'var(--danger)', padding: '4px 10px', minHeight: 28, fontSize: '0.8rem', flexShrink: 0 }}
                    onClick={() => deleteQuestion(q.id)}
                  >
                    删除
                  </button>
                </div>
              ))}
              {questions.length > 20 && (
                <p className="muted" style={{ textAlign: 'center' }}>... 还有 {questions.length - 20} 题未显示</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: 匹配管理 */}
      {/* ================================================================ */}
      {activeTab === 'matching' && (
        <div className="stack" style={{ gap: 24 }}>
          {/* 匹配任务列表 */}
          <section className="panel stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>📋 匹配任务列表</h2>
                <p className="muted">查看系统中所有用户的匹配任务及结果（来自数据库）。</p>
              </div>
              <button className="button-ghost" onClick={loadMatchTasks} disabled={matchTasksLoading} style={{ fontSize: '0.8rem' }}>
                {matchTasksLoading ? '⏳ 加载中...' : '🔄 刷新'}
              </button>
            </div>
            {matchTasksLoading && matchTasks.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>加载匹配任务中...</p>
            ) : matchTasks.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>暂无匹配任务数据。用户完成匹配后任务将显示在这里。</p>
            ) : (
            <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>任务ID</th>
                    <th style={{ padding: '8px 12px' }}>用户</th>
                    <th style={{ padding: '8px 12px' }}>状态</th>
                    <th style={{ padding: '8px 12px' }}>最佳匹配</th>
                    <th style={{ padding: '8px 12px' }}>兼容度</th>
                    <th style={{ padding: '8px 12px' }}>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {matchTasks.map((task) => (
                    <tr key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{task.id}</td>
                      <td style={{ padding: '8px 12px' }}>{task.userName}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          color: STATUS_COLORS[task.status] ?? 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                        }}>
                          {STATUS_LABELS[task.status] ?? task.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>{task.topMatch ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {task.topScore != null ? (
                          <span style={{
                            fontWeight: 700,
                            color: task.topScore >= 85 ? 'var(--success)' : task.topScore >= 70 ? 'var(--accent)' : 'var(--muted)',
                          }}>
                            {task.topScore}%
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="stats" style={{ marginTop: 8 }}>
              <span className="stat">总任务: {matchTasks.length}</span>
              <span className="stat">已完成: {matchTasks.filter((t) => t.status === 'completed').length}</span>
              <span className="stat">进行中: {matchTasks.filter((t) => t.status === 'matching' || t.status === 'profiling').length}</span>
            </div>
            </>
            )}
          </section>

          {/* 候选 AI 管理 */}
          <section className="panel stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>🤖 候选 AI 管理</h2>
                <p className="muted">管理华清池 AI 伴侣候选池（数据库，共 {candidates.length} 个）</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button-ghost" onClick={loadCandidates} disabled={candidatesLoading} style={{ fontSize: '0.8rem' }}>
                  {candidatesLoading ? '⏳' : '🔄'}
                </button>
                <button className="button" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowAddCandidate(!showAddCandidate)}>
                  {showAddCandidate ? '取消' : '+ 添加候选AI'}
                </button>
              </div>
            </div>

            {/* 添加候选 AI 表单 */}
            {showAddCandidate && (
              <div className="panel" style={{ padding: 16, background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                <h3>添加候选 AI</h3>
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="field" style={{ flex: 1 }} placeholder="AI ID (如 xiaowei)" value={newCandidate.id} onChange={(e) => setNewCandidate((p) => ({ ...p, id: e.target.value }))} />
                    <input className="field" style={{ flex: 2 }} placeholder="AI 名称 (如 小薇)" value={newCandidate.name} onChange={(e) => setNewCandidate((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <textarea className="field" rows={2} placeholder="描述" value={newCandidate.description} onChange={(e) => setNewCandidate((p) => ({ ...p, description: e.target.value }))} style={{ resize: 'vertical' }} />
                  <input className="field" placeholder="人格标签 (逗号分隔, 如: 温柔,体贴)" value={newCandidate.personalityTags} onChange={(e) => setNewCandidate((p) => ({ ...p, personalityTags: e.target.value }))} />
                  <input className="field" placeholder="兴趣标签 (逗号分隔, 如: 文学,阅读)" value={newCandidate.interestTags} onChange={(e) => setNewCandidate((p) => ({ ...p, interestTags: e.target.value }))} />
                  <input className="field" placeholder="情绪标签 (逗号分隔, 如: 共情,安抚)" value={newCandidate.emotionTags} onChange={(e) => setNewCandidate((p) => ({ ...p, emotionTags: e.target.value }))} />
                  <input className="field" placeholder="能力分数 (1-10)" type="number" min={1} max={10} value={newCandidate.capabilityScore} onChange={(e) => setNewCandidate((p) => ({ ...p, capabilityScore: e.target.value }))} />
                  <button className="button" onClick={addCandidate} style={{ alignSelf: 'flex-start' }}>确认添加</button>
                </div>
              </div>
            )}

            {/* 候选列表 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {candidates.map((c) => (
                <div key={c.id} className="panel" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>{c.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{c.id}</span>
                    </div>
                    <button
                      className="button-ghost"
                      style={{ color: 'var(--danger)', padding: '2px 8px', minHeight: 24, fontSize: '0.75rem' }}
                      onClick={() => deleteCandidate(c.id)}
                    >
                      删除
                    </button>
                  </div>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 8px' }}>{c.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {c.personalityTags.map((t) => (
                      <span key={t} className="chip" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: 系统信息 */}
      {/* ================================================================ */}
      {activeTab === 'system' && (
        <div className="stack" style={{ gap: 24 }}>
          {/* 系统参数管理 */}
          <section className="panel stack">
            <h2>⚙️ 系统参数配置</h2>
            <p className="muted">配置评估阈值、匹配权重、报告模板等系统参数。</p>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {params.length === 0 ? (
                <p className="muted">暂无系统参数，请在下方添加。</p>
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
                <input className="field" placeholder="参数键名 (如 eval.iq_threshold)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                <input className="field" placeholder="参数值" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                <input className="field" placeholder="描述（选填）" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                <button className="button" onClick={addParameter} disabled={loading}>
                  {loading ? '添加中...' : '添加参数'}
                </button>
              </div>
            </div>
          </section>

          {/* 系统状态概览 */}
          <section className="panel stack">
            <h2>📊 系统状态</h2>
            <p className="muted">当前系统运行状态概览。</p>
            <div className="stats" style={{ flexWrap: 'wrap', gap: 12 }}>
              <span className="stat">📋 系统参数: {params.length} 项</span>
              <span className="stat">📚 题库总量: {questions.length} 题</span>
              <span className="stat">🤖 候选AI池: {candidates.length} 个</span>
              <span className="stat">📝 评估任务: {evalTasks.length} 个</span>
              <span className="stat">💞 匹配任务: {matchTasks.length} 个</span>
              <span className="stat">👤 当前角色: {session.user.role}</span>
            </div>
            <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,0.06)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.15)' }}>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>🟢 系统运行正常</span>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
                所有模块已就绪。管理员可通过本页面管理系统配置、题库和候选 AI 池。
              </p>
            </div>
          </section>

          {/* 快捷操作 */}
          <section className="panel stack">
            <h2>🔗 快捷入口</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <Link href="/evaluation" className="panel" style={{ padding: 16, textDecoration: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🧠</div>
                <strong>评估页面</strong>
                <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>用户评估入口</p>
              </Link>
              <Link href="/matching" className="panel" style={{ padding: 16, textDecoration: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>💞</div>
                <strong>匹配页面</strong>
                <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>用户匹配入口</p>
              </Link>
              <Link href="/" className="panel" style={{ padding: 16, textDecoration: 'none', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🏠</div>
                <strong>返回首页</strong>
                <p className="muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>平台首页</p>
              </Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
