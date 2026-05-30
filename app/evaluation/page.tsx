"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { readAuthSession, type AuthSessionState } from '@/lib/auth-session';
import {
  createEvaluationTask,
  initializeTask,
  markTaskReady,
  markTaskEvaluating,
  markTaskFinalizing,
  markTaskCompleted,
  markTaskCancelled,
  markTaskAborted,
  getNextQuestion,
  recordAnswer,
  shouldContinueLoop,
  generateAiResponse,
  aggregateEvaluation,
  createEvaluationLoopState
} from '@/lib/evaluation';
import type { EvaluationTask, EvaluationQuestion, EvaluationLoopState } from '@/lib/types';

type PagePhase = 'welcome' | 'select-type' | 'evaluating' | 'finalizing' | 'result';

export default function EvaluationPage() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [phase, setPhase] = useState<PagePhase>('welcome');
  const [task, setTask] = useState<EvaluationTask | null>(null);
  const [loopState, setLoopState] = useState<EvaluationLoopState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<EvaluationQuestion | null>(null);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<{
    score: { iq: number; eq: number; overall: number; details?: { questionId: string; iq: number; eq: number }[] };
    conclusion: string;
    answers: { questionId: string; answer: string }[];
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSession(readAuthSession());
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 开始评估
  const startEvaluation = useCallback(
    (type: 'iq' | 'eq' | 'iq_eq') => {
      if (!session?.user?.id) return;

      const newTask = createEvaluationTask(session.user.id, type);
      const inited = initializeTask(newTask);
      const ready = markTaskReady(inited);
      const started = markTaskEvaluating(ready);
      setTask(started);
      setLoopState(createEvaluationLoopState(started));
      setPhase('evaluating');
      setProgress(0);
    },
    [session]
  );

  // 处理当前题目 -> AI 回答 -> 评分循环
  useEffect(() => {
    if (phase !== 'evaluating' || !task || !shouldContinueLoop(task)) {
      if (task && task.answers.length === task.questions.length && phase === 'evaluating') {
        // 所有题目已完成，进入汇总阶段
        finishEvaluation(task);
      }
      return;
    }

    const { question } = getNextQuestion(task);
    if (!question) {
      finishEvaluation(task);
      return;
    }

    setCurrentQuestion(question);
    setProgress(Math.round((task.currentQuestionIndex / task.questions.length) * 100));
    setIsAiThinking(true);
    setAiResponse('');

    // 模拟 AI 思考延迟 (对应 UML: AIModelEngine - Process Question Text)
    const thinkingTime = 1000 + Math.random() * 1500;
    timerRef.current = setTimeout(() => {
      const response = generateAiResponse(question.id);
      setAiResponse(response);
      setIsAiThinking(false);

      // 自动评分并记录 (对应 UML: ScoringEngine - Grade AI Response)
      const { task: updatedTask } = recordAnswer(task, response);
      setTask(updatedTask);
      setCurrentQuestion(null);
    }, thinkingTime);

    return clearTimer;
  }, [phase, task, task?.currentQuestionIndex, clearTimer]);

  // 完成评估 (对应 UML: Finalizing state)
  const finishEvaluation = useCallback((currentTask: EvaluationTask) => {
    const finalized = markTaskFinalizing(currentTask);
    setTask(finalized);
    setPhase('finalizing');

    // 汇总分数 (对应 UML: ScoringEngine - Calculate Overall Score)
    setTimeout(() => {
      const score = aggregateEvaluation(finalized.questions, finalized.answers);
      const completed = markTaskCompleted(finalized);
      setTask(completed);

      const conclusion =
        score.overall >= 85
          ? '该 AI 在逻辑推理与情绪回应上表现出色，具备极强的复杂交互能力。'
          : score.overall >= 70
            ? '该 AI 具有优秀的综合能力，在推理和情感维度表现均衡。'
            : score.overall >= 55
              ? '该 AI 具有可用的综合能力，但在某些维度仍有提升空间。'
              : '该 AI 需要进一步优化回答质量、稳定性与情绪表达。';

      setReport({
        score,
        conclusion,
        answers: completed.answers
      });
      setPhase('result');
    }, 1500);
  }, []);

  // 取消评估
  const cancelEvaluation = useCallback(() => {
    clearTimer();
    if (task) {
      setTask(markTaskCancelled(task));
    }
    setPhase('welcome');
    setCurrentQuestion(null);
    setAiResponse('');
    setIsAiThinking(false);
    setReport(null);
  }, [task, clearTimer]);

  // 获取分数颜色
  const scoreColor = (value: number) => {
    if (value >= 80) return 'var(--success)';
    if (value >= 60) return 'var(--accent)';
    return 'var(--danger)';
  };

  // ========== 渲染 ==========

  // 欢迎页
  if (phase === 'welcome') {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>AI 智商 / 情商评估</h1>
            <p>通过多领域题库对 AI 进行智商、情商及综合能力评估</p>
          </div>
          <span className="chip">评估 / 循环 / 汇总</span>
        </section>

        <section className="panel stack">
          {!session ? (
            <div className="panel" style={{ padding: 16 }}>
              <p className="muted">请先登录后再进行评估。</p>
              <Link className="button" href="/login">去登录</Link>
            </div>
          ) : (
            <>
              <div className="stats">
                <span className="stat">用户: {session.user.username ?? session.user.email}</span>
              </div>

              <div>
                <h2>选择评估类型</h2>
                <div className="grid" style={{ marginTop: 16 }}>
                  <article className="grid-card" style={{ cursor: 'pointer' }} onClick={() => startEvaluation('iq')}>
                    <h3>🧠 智商评估 (IQ)</h3>
                    <p>测试 AI 的逻辑推理、抽象建模和问题分析能力。</p>
                    <span className="chip" style={{ marginTop: 12 }}>逻辑 / 推理 / 分析</span>
                  </article>
                  <article className="grid-card" style={{ cursor: 'pointer' }} onClick={() => startEvaluation('eq')}>
                    <h3>❤️ 情商评估 (EQ)</h3>
                    <p>测试 AI 的共情理解、情绪调节和人际互动能力。</p>
                    <span className="chip" style={{ marginTop: 12 }}>共情 / 情绪 / 社交</span>
                  </article>
                  <article className="grid-card" style={{ cursor: 'pointer' }} onClick={() => startEvaluation('iq_eq')}>
                    <h3>⚖️ 综合评估 (IQ+EQ)</h3>
                    <p>全面测试 AI 在逻辑与情感维度的综合表现。</p>
                    <span className="chip" style={{ marginTop: 12 }}>综合 / 平衡 / 全面</span>
                  </article>
                </div>
              </div>

              <div>
                <h2>评估流程</h2>
                <ol className="muted">
                  <li><strong>创建任务</strong> → 选择评估类型并创建评测会话</li>
                  <li><strong>评估循环</strong>: 逐题取题 → AI 回答 → 自动评分 → 记录结果（循环执行）</li>
                  <li><strong>汇总报告</strong>: 聚合所有分数 → 计算加权总分 → 生成分析报告</li>
                </ol>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  // 评估进行中
  if (phase === 'evaluating') {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>评估进行中</h1>
            <p>{task?.evaluationType === 'iq' ? '智商评估' : task?.evaluationType === 'eq' ? '情商评估' : '综合评估'}</p>
          </div>
          <span className="chip">
            {isAiThinking ? 'AI 思考中...' : '评分中...'} · 第 {task?.answers.length ?? 0}/{task?.questions.length ?? 0} 题
          </span>
        </section>

        {/* 进度条 */}
        <div style={{
          width: '100%',
          height: 8,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 4,
          marginBottom: 20,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
            borderRadius: 4,
            transition: 'width 0.5s ease'
          }} />
        </div>

        <section className="panel stack">
          {/* 当前题目 */}
          {currentQuestion && (
            <div>
              <div className="stats" style={{ marginBottom: 12 }}>
                <span className="stat">难度: {'⭐'.repeat(currentQuestion.difficulty)}</span>
                <span className="stat">维度: {currentQuestion.dimension === 'iq' ? '逻辑' : currentQuestion.dimension === 'eq' ? '情感' : '综合'}</span>
              </div>
              <div className="panel" style={{
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.2)'
              }}>
                <h3>{currentQuestion.title}</h3>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.8 }}>{currentQuestion.prompt}</p>
              </div>
            </div>
          )}

          {/* AI 思考状态 */}
          {isAiThinking && (
            <div className="panel" style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)'
            }}>
              <div className="stats">
                <span className="stat">🤖 AI 模型正在处理问题...</span>
                <span className="stat" style={{ animation: 'pulse 1.5s infinite' }}>⏳ 生成回答中</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `bounce 1.4s ${i * 0.2}s infinite`
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* AI 回答 */}
          {aiResponse && !isAiThinking && (
            <div className="panel" style={{
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.2)'
            }}>
              <div className="stats" style={{ marginBottom: 8 }}>
                <span className="stat">✅ AI 回答完成</span>
                <span className="stat">📊 评分中...</span>
              </div>
              <p style={{ lineHeight: 1.8 }}>{aiResponse}</p>
            </div>
          )}
        </section>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="button" onClick={cancelEvaluation} style={{ background: 'var(--danger)', color: 'white' }}>
            中止评估
          </button>
        </div>

        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes bounce { 0%,80%,100% { transform: scale(0.6); } 40% { transform: scale(1); } }
        `}</style>
      </main>
    );
  }

  // 结果汇总中
  if (phase === 'finalizing') {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>正在生成评估报告</h1>
            <p>正在汇总所有题目评分，计算综合得分并生成分析结论……</p>
          </div>
          <span className="chip">汇总中...</span>
        </section>
        <section className="panel stack" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '3rem', marginBottom: 20 }}>📊</div>
          <h2>正在计算综合评分...</h2>
          <div style={{
            width: 60, height: 60, margin: '20px auto',
            border: '4px solid rgba(255,255,255,0.1)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
      </main>
    );
  }

  // 评估结果
  if (phase === 'result' && report) {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>评估报告</h1>
            <p>评估已完成，以下为 AI 的智商与情商综合评分</p>
          </div>
          <span className="chip">
            {report.score.overall >= 80 ? '🌟 优秀' : report.score.overall >= 60 ? '👍 良好' : '📈 待提升'}
          </span>
        </section>

        {/* 环形仪表盘 */}
        <section className="panel stack" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', padding: '20px 0' }}>
            {[
              { label: '智商 IQ', value: report.score.iq, color: '#38bdf8', desc: '逻辑推理·抽象分析能力' },
              { label: '情商 EQ', value: report.score.eq, color: '#f59e0b', desc: '共情理解·情绪调节能力' },
              { label: '综合评分', value: report.score.overall, color: '#22c55e', desc: '加权综合表现' }
            ].map((item) => (
              <GaugeRing key={item.label} label={item.label} value={item.value} color={item.color} desc={item.desc} />
            ))}
          </div>

          {/* 雷达风格条形对比 */}
          <div style={{ marginTop: 8 }}>
            <h3 style={{ marginBottom: 16 }}>多维度能力雷达</h3>
            {[
              { label: '逻辑推理', value: report.score.details?.[0]?.iq ?? 0, max: 100 },
              { label: '抽象建模', value: report.score.details?.[1]?.iq ?? 0, max: 100 },
              { label: '共情理解', value: report.score.details?.[2]?.eq ?? report.score.details?.[0]?.eq ?? 0, max: 100 },
              { label: '情绪调节', value: report.score.details?.[3]?.eq ?? report.score.details?.[1]?.eq ?? 0, max: 100 },
              { label: '综合判断', value: report.score.iq, max: 100 },
              { label: '综合决策', value: report.score.eq, max: 100 }
            ].map((item) => (
              <div key={item.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.9rem' }}>
                  <span>{item.label}</span>
                  <span style={{ fontWeight: 700 }}>{item.value}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(item.value, 100)}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, #38bdf8, #f59e0b, #22c55e)`,
                    borderRadius: 4,
                    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 12px rgba(56,189,248,0.3)'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 题目明细 */}
        <section className="panel stack" style={{ marginTop: 16 }}>
          <h2>题目明细</h2>
          {task?.questions.map((q, i) => {
            const ans = report.answers[i];
            const detail = report.score.details?.find((d) => d.questionId === q.id);
            return (
              <div key={q.id} className="panel" style={{ padding: 16 }}>
                <div className="stats" style={{ marginBottom: 8 }}>
                  <span className="stat">#{i + 1} {q.title}</span>
                  {detail && (
                    <>
                      <span className="stat" style={{ color: scoreColor(detail.iq) }}>IQ: {detail.iq}</span>
                      <span className="stat" style={{ color: scoreColor(detail.eq) }}>EQ: {detail.eq}</span>
                    </>
                  )}
                </div>
                <p className="muted" style={{ fontSize: '0.9rem' }}><strong>问题:</strong> {q.prompt}</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--success)' }}><strong>AI 回答:</strong> {ans?.answer}</p>
              </div>
            );
          })}
        </section>

        {/* 结论 */}
        <section className="panel stack" style={{ marginTop: 16 }}>
          <h2>评估结论</h2>
          <p style={{ fontSize: '1.1rem', lineHeight: 1.8 }}>{report.conclusion}</p>
        </section>

        {/* 操作 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="button" onClick={() => {
            setPhase('welcome');
            setTask(null);
            setReport(null);
            setAiResponse('');
          }}>
            重新评估
          </button>
          <Link className="button-ghost" href="/matching">华清池匹配</Link>
          <Link className="button-ghost" href="/">返回首页</Link>
        </div>
      </main>
    );
  }

  // fallback
  return null;
}

// ========== 环形仪表盘组件 ==========
function GaugeRing({ label, value, color, desc }: { label: string; value: number; color: string; desc: string }) {
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <filter id={`glow-${label}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="70" cy="70" r={radius} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx="70" cy="70" r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          filter={`url(#glow-${label})`}
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        <text x="70" y="62" textAnchor="middle" fill="#fff"
          fontSize="22" fontWeight="700" fontFamily="var(--font-display)">
          {value}
        </text>
        <text x="70" y="82" textAnchor="middle" fill="var(--muted)"
          fontSize="12">/ 100</text>
      </svg>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color }}>{label}</div>
      <div className="muted" style={{ fontSize: '0.75rem' }}>{desc}</div>
    </div>
  );
}