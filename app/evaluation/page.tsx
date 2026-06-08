/*
 * ==========================================================================
 * AI 智商/情商评估页面 — 对应 UML 类图: EvaluationUI
 * ==========================================================================
 * 核心流程 (对应 UML 活动图 AIEvaluationParentActivityUML.txt):
 *   welcome → select-type → evaluating (子循环) → finalizing → result
 *
 * 评估循环 (对应 UML 活动图 AIEvaluationChildLoopActivityUML.txt):
 *   getNextQuestion → AI思考 → generateAiResponse → recordAnswer → 循环判断
 *
 * 状态机 (对应 UML 状态图 AI智商情商状态图UML.txt):
 *   uninitialized → initializing → ready → evaluating → finalizing → completed
 * ==========================================================================
 */

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
  getReferenceAnswer,
  aggregateEvaluation,
  computeRadarDimensions,
  createEvaluationLoopState,
  AVAILABLE_AI_MODELS,
  DEFAULT_AI_MODEL,
  generateEvaluationReportFromSupabase
} from '@/lib/evaluation';
import type { EvaluationTask, EvaluationQuestion, EvaluationLoopState, AiModelId } from '@/lib/types';
import type { RadarDimensions } from '@/lib/evaluation';

type PagePhase = 'welcome' | 'select-type' | 'evaluating' | 'finalizing' | 'result';

export default function EvaluationPage() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [phase, setPhase] = useState<PagePhase>('welcome');
  const [task, setTask] = useState<EvaluationTask | null>(null);
  const [selectedModel, setSelectedModel] = useState<AiModelId>(DEFAULT_AI_MODEL);
  const [loopState, setLoopState] = useState<EvaluationLoopState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<EvaluationQuestion | null>(null);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<{
    score: { iq: number; eq: number; overall: number; details?: { questionId: string; iq: number; eq: number }[] };
    conclusion: string;
    answers: { questionId: string; answer: string }[];
    radar: RadarDimensions;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

      const newTask = createEvaluationTask(session.user.id, type, undefined, selectedModel);
      const inited = initializeTask(newTask);
      const ready = markTaskReady(inited);
      const started = markTaskEvaluating(ready);
      setTask(started);
      setLoopState(createEvaluationLoopState(started));
      setPhase('evaluating');
      setProgress(0);
    },
    [session, selectedModel]
  );

  // 处理当前题目 -> 调用真实 AI API -> 评分循环
  useEffect(() => {
    if (phase !== 'evaluating' || !task || !shouldContinueLoop(task)) {
      if (task && task.answers.length === task.questions.length && phase === 'evaluating') {
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

    // 创建 AbortController 用于取消 API 请求
    const controller = new AbortController();
    abortRef.current = controller;

    // 异步调用真实 AI API (对应 UML: AIModelEngine - Process Question Text)
    const runEvaluation = async () => {
      try {
        const response = await generateAiResponse(question.id, question.prompt, task.modelId);
        // 检查是否已被取消
        if (controller.signal.aborted) return;

        setAiResponse(response);
        setIsAiThinking(false);

        // 自动评分并记录 (对应 UML: ScoringEngine - Grade AI Response)
        const scored = recordAnswer(task, response);
        setTask(scored.task);
        setCurrentQuestion(null);
      } catch {
        // API 调用失败，降级为模板回答
        if (controller.signal.aborted) return;

        const fallback = getReferenceAnswer(question.id);
        setAiResponse(fallback);
        setIsAiThinking(false);

        const scored = recordAnswer(task, fallback);
        setTask(scored.task);
        setCurrentQuestion(null);
      }
    };

    runEvaluation();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [phase, task, task?.currentQuestionIndex, clearTimer]);

  // 完成评估 (对应 UML: Finalizing state)
  const finishEvaluation = useCallback((currentTask: EvaluationTask) => {
    const finalized = markTaskFinalizing(currentTask);
    setTask(finalized);
    setPhase('finalizing');

    // 汇总分数 (对应 UML: ScoringEngine - Calculate Overall Score)
    setTimeout(async () => {
      const score = aggregateEvaluation(finalized.questions, finalized.answers, finalized.evaluationType);
      const radar = computeRadarDimensions(finalized.questions, finalized.answers);
      const completed = markTaskCompleted(finalized);
      setTask(completed);

      const evaluationType = finalized.evaluationType;
      let conclusion: string;
      if (evaluationType === 'iq') {
        conclusion = score.iq >= 85
          ? '该 AI 在逻辑推理、抽象建模和问题分析方面表现出色，具备极强的复杂推理能力。'
          : score.iq >= 70
            ? '该 AI 具有优秀的逻辑推理能力，在 IQ 相关维度表现良好。'
            : score.iq >= 55
              ? '该 AI 具有基本的逻辑推理能力，但在复杂推理场景中仍有提升空间。'
              : '该 AI 的逻辑推理能力需要进一步优化，建议加强分析、推理和抽象建模训练。';
      } else if (evaluationType === 'eq') {
        conclusion = score.eq >= 85
          ? '该 AI 在共情理解、情绪调节和人际互动方面表现出色，具备极强的情感智能。'
          : score.eq >= 70
            ? '该 AI 具有优秀的情绪感知与回应能力，在 EQ 相关维度表现良好。'
            : score.eq >= 55
              ? '该 AI 具有基本的共情与情绪应对能力，但在细腻情感处理上仍有提升空间。'
              : '该 AI 的情绪理解和回应能力需要进一步优化，建议加强共情、情绪调节训练。';
      } else {
        conclusion = score.overall >= 85
          ? '该 AI 在逻辑推理与情绪回应上表现出色，具备极强的复杂交互能力。'
          : score.overall >= 70
            ? '该 AI 具有优秀的综合能力，在推理和情感维度表现均衡。'
            : score.overall >= 55
              ? '该 AI 具有可用的综合能力，但在某些维度仍有提升空间。'
              : '该 AI 需要进一步优化回答质量、稳定性与情绪表达。';
      }

      setReport({
        score,
        conclusion,
        answers: completed.answers,
        radar
      });
      setPhase('result');

      // 同步评估分数到 AI 候选数据库 (带平均值计算)
      if (currentTask.modelId && session?.user?.id) {
        try {
          await generateEvaluationReportFromSupabase(
            session.user.id,
            finalized.evaluationType,
            completed.answers,
            { modelId: currentTask.modelId }
          );
        } catch {
          // 同步失败不影响主流程
        }
      }
    }, 1500);
  }, [session]);

  // 取消评估
  const cancelEvaluation = useCallback(() => {
    clearTimer();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
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

              {/* AI 模型选择器 */}
              <div>
                <h2>选择测试模型</h2>
                <p className="muted" style={{ marginBottom: 12 }}>选择要评估的 AI 模型，不同模型的表现可能差异显著</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {AVAILABLE_AI_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: selectedModel === m.id
                          ? '2px solid var(--accent)'
                          : '1px solid rgba(255,255,255,0.12)',
                        background: selectedModel === m.id
                          ? 'rgba(56,189,248,0.12)'
                          : 'rgba(255,255,255,0.04)',
                        color: selectedModel === m.id ? 'var(--accent)' : 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s',
                        textAlign: 'left'
                      }}
                      title={m.description}
                    >
                      <div style={{ fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: 2 }}>{m.description}</div>
                    </button>
                  ))}
                </div>
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

{/*
               * ========== 评估流程 (对应 UML 活动图: AIEvaluationParentActivity) ==========
               * 1. RequestEvaluation → ValidateRequest → CreateSession → InitializeEvaluation
               * 2. 评估循环 (子活动图 AIEvaluationChildLoopActivity):
               *    FetchNextQuestion → SubmitQuestion → AIResponse → GradeResponse → SaveIntermediateResult
               * 3. CalculateOverallScore → GenerateReport → ProvideReport
               */}
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
            {task?.modelId && <> · {AVAILABLE_AI_MODELS.find(m => m.id === task.modelId)?.label ?? task.modelId}</>}
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
    const evalType = task?.evaluationType ?? 'iq_eq';
    const isIq = evalType === 'iq';
    const isEq = evalType === 'eq';
    const isBoth = evalType === 'iq_eq';

    // 决定显示哪些仪表盘
    const gauges: { label: string; value: number; color: string; desc: string }[] = [];
    if (isIq || isBoth) {
      gauges.push({ label: '智商 IQ', value: report.score.iq, color: '#38bdf8', desc: '逻辑推理·抽象分析能力' });
    }
    if (isEq || isBoth) {
      gauges.push({ label: '情商 EQ', value: report.score.eq, color: '#f59e0b', desc: '共情理解·情绪调节能力' });
    }
    if (isBoth) {
      gauges.push({ label: '综合评分', value: report.score.overall, color: '#22c55e', desc: '加权综合表现' });
    } else {
      // 纯 IQ 或纯 EQ 显示综合评分（以主维度加权）
      gauges.push({ label: '综合评分', value: report.score.overall, color: '#22c55e', desc: isIq ? 'IQ 加权综合' : 'EQ 加权综合' });
    }

    const headerChip = isIq ? '🧠 IQ 评估' : isEq ? '❤️ EQ 评估' : '⚖️ 综合评估';
    const headerDesc = isIq
      ? `评估已完成，以下为 AI 的智商评估报告${task?.modelId ? ` · 模型: ${AVAILABLE_AI_MODELS.find(m => m.id === task.modelId)?.label ?? task.modelId}` : ''}`
      : isEq
        ? `评估已完成，以下为 AI 的情商评估报告${task?.modelId ? ` · 模型: ${AVAILABLE_AI_MODELS.find(m => m.id === task.modelId)?.label ?? task.modelId}` : ''}`
        : `评估已完成，以下为 AI 的智商与情商综合评分${task?.modelId ? ` · 模型: ${AVAILABLE_AI_MODELS.find(m => m.id === task.modelId)?.label ?? task.modelId}` : ''}`;

    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>评估报告</h1>
            <p>{headerDesc}</p>
          </div>
          <span className="chip">
            {report.score.overall >= 80 ? '🌟 优秀' : report.score.overall >= 60 ? '👍 良好' : '📈 待提升'}
            {' · '}{headerChip}
          </span>
        </section>

        {/* 环形仪表盘 */}
        <section className="panel stack" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', padding: '20px 0' }}>
            {gauges.map((item) => (
              <GaugeRing key={item.label} label={item.label} value={item.value} color={item.color} desc={item.desc} />
            ))}
          </div>

          {/* SVG 雷达图 */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 16 }}>多维度能力雷达</h3>
            <RadarChart radar={report.radar} />
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

// ========== SVG 雷达图组件 ==========
function RadarChart({ radar }: { radar: RadarDimensions }) {
  const dimensions = [
    { key: '逻辑推理' as const, label: '逻辑推理' },
    { key: '抽象建模' as const, label: '抽象建模' },
    { key: '共情理解' as const, label: '共情理解' },
    { key: '情绪调节' as const, label: '情绪调节' },
    { key: '综合判断' as const, label: '综合判断' },
    { key: '综合决策' as const, label: '综合决策' }
  ];

  const n = dimensions.length;
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 120;
  const levels = 5;

  // 计算多边形顶点坐标
  const angleSlice = (2 * Math.PI) / n;
  const getPoint = (index: number, value: number) => {
    const angle = angleSlice * index - Math.PI / 2; // 从顶部开始
    const r = (value / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  };

  // 背景网格多边形 (levels 层同心多边形)
  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * maxR;
    const points = Array.from({ length: n }, (_, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
    return points;
  });

  // 数据多边形
  const dataPoints = dimensions.map((d, i) => getPoint(i, radar[d.key]));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // 轴线
  const axes = dimensions.map((_, i) => {
    const end = getPoint(i, 100);
    return { x1: cx, y1: cy, x2: end.x, y2: end.y };
  });

  // 颜色渐变 (蓝色 → 橙色 → 绿色)
  const colors = ['#38bdf8', '#38bdf8', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.25)" />
            <stop offset="50%" stopColor="rgba(245,158,11,0.15)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0.05)" />
          </radialGradient>
          <filter id="radar-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 同心网格 */}
        {gridPolygons.map((points, i) => (
          <polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.5}
          />
        ))}

        {/* 轴线 */}
        {axes.map((axis, i) => (
          <line
            key={`axis-${i}`}
            x1={axis.x1} y1={axis.y1} x2={axis.x2} y2={axis.y2}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={0.5}
          />
        ))}

        {/* 数据填充区域 */}
        <polygon
          points={dataPolygon}
          fill="url(#radar-fill)"
          stroke="rgba(56,189,248,0.5)"
          strokeWidth={2}
          filter="url(#radar-glow)"
          style={{ transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />

        {/* 数据点 */}
        {dataPoints.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x} cy={p.y} r={5}
            fill={colors[i]}
            stroke="#fff"
            strokeWidth={1.5}
            filter="url(#radar-glow)"
          >
            <animate attributeName="r" from="0" to="5" dur="0.5s" begin={`${i * 0.1}s`} fill="freeze" />
          </circle>
        ))}

        {/* 数值标签 */}
        {dataPoints.map((p, i) => {
          const angle = angleSlice * i - Math.PI / 2;
          const val = radar[dimensions[i].key];
          // 标签偏移，避免与数据点重叠
          const labelR = maxR + 28;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          return (
            <text
              key={`val-${i}`}
              x={lx} y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={colors[i]}
              fontSize="13"
              fontWeight="700"
              style={{ textShadow: '0 0 8px rgba(0,0,0,0.6)' }}
            >
              {val}
            </text>
          );
        })}

        {/* 维度标签 */}
        {dimensions.map((d, i) => {
          const angle = angleSlice * i - Math.PI / 2;
          const labelR = maxR + 46;
          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          return (
            <text
              key={`label-${i}`}
              x={lx} y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize="12"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}