/*
 * ==========================================================================
 * 华清池 AI 伴侣匹配页面 — 对应 UML 类图: HuaQingUI
 * ==========================================================================
 * 核心流程 (对应 UML 活动图 HuaqingMatchingParentActivityUML.txt):
 *   welcome → questionnaire → processing → result
 *
 * 匹配算法 (对应 UML 活动图 HuaqingMatchingChildActivityUML.txt):
 *   并行计算兴趣/人格/情绪兼容度 → 聚合分数 → 排序 → 返回结果
 *
 * 状态机 (对应 UML 状态图 华清池AI伴侣匹配状态图UML.txt):
 *   idle → questionnaire_pending → profiling → candidate_retrieval
 *        → matching → delivering_result → completed
 * ==========================================================================
 */

"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readAuthSession, type AuthSessionState } from '@/lib/auth-session';
import {
  matchingQuestionnaire,
  createMatchingTask,
  markQuestionnairePending,
  markProfiling,
  markCandidateRetrieval,
  markMatching,
  markDeliveringResult,
  markMatchCompleted,
  buildUserProfileFromAnswers,
  rankCandidates,
  calculateCompatibility,
  computeMatchingRadar,
  type MatchingRadarDimensions
} from '@/lib/matching';
import { aiCandidates } from '@/lib/mock-data';
import { readAiCandidates } from '@/lib/supabase';
import type { QuestionnaireQuestion, MatchingTask, CandidateMatchResult, CandidateAI } from '@/lib/types';

type PagePhase = 'welcome' | 'questionnaire' | 'processing' | 'result';

export default function MatchingPage() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [phase, setPhase] = useState<PagePhase>('welcome');
  const [task, setTask] = useState<MatchingTask | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [openAnswer, setOpenAnswer] = useState('');
  const [processingStep, setProcessingStep] = useState('');
  const [report, setReport] = useState<{
    profile: { interests: string[]; personality: string[]; needs: string[] };
    rankedCandidates: CandidateMatchResult[];
    summary: string;
  } | null>(null);
  const [showAllDetails, setShowAllDetails] = useState(false);

  useEffect(() => {
    setSession(readAuthSession());
  }, []);

  // 开始匹配
  const startMatching = useCallback(() => {
    if (!session?.user?.id) return;
    const newTask = createMatchingTask(session.user.id);
    const pending = markQuestionnairePending(newTask);
    setTask(pending);
    setPhase('questionnaire');
    setCurrentQIndex(0);
    setAnswers({});
    setOpenAnswer('');
    setReport(null);
  }, [session]);

  // 处理选项选择 (多选)
  const toggleOption = (questionId: string, option: string) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (current.includes(option)) {
        return { ...prev, [questionId]: current.filter((o) => o !== option) };
      }
      return { ...prev, [questionId]: [...current, option] };
    });
  };

  // 处理单选
  const selectOption = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: [option] }));
  };

  // 提交问卷答案
  const submitQuestionnaire = useCallback(async () => {
    if (!task) return;

    // 合并开放式答案
    const allAnswers = { ...answers };
    if (openAnswer.trim()) {
      allAnswers['open-1'] = [openAnswer.trim()];
    }

    // 进入画像构建阶段 (对应 UML: Profiling)
    const profilingTask = markProfiling(task);
    setTask(profilingTask);
    setPhase('processing');
    setProcessingStep('正在分析问卷答案...');

    await new Promise((r) => setTimeout(r, 800));

    // 构建用户画像 (对应 UML: ProfileBuilder)
    const profile = buildUserProfileFromAnswers(allAnswers);
    setProcessingStep('用户画像构建完成，正在搜索候选 AI...');

    await new Promise((r) => setTimeout(r, 600));

    // 候选检索 (对应 UML: CandidateRetrieval) — 优先从数据库加载
    const retrievalTask = markCandidateRetrieval(profilingTask);
    setTask(retrievalTask);

    // 尝试从 Supabase 加载候选 AI，失败则使用本地 mock 数据
    let candidates: CandidateAI[] = aiCandidates;
    try {
      const dbCandidates = await readAiCandidates();
      if (dbCandidates.length > 0) {
        candidates = dbCandidates;
      }
    } catch {
      // 数据库不可用时使用本地数据
    }

    setProcessingStep(`找到 ${candidates.length} 个候选 AI，正在进行匹配计算...`);

    await new Promise((r) => setTimeout(r, 700));

    // 匹配计算 (对应 UML: Matching)
    const matchingTask = markMatching(retrievalTask);
    setTask(matchingTask);
    setProcessingStep('计算兼容度分数...');

    await new Promise((r) => setTimeout(r, 500));

    const rankedCandidates = rankCandidates(profile, candidates);

    // 结果传送 (对应 UML: DeliveringResult)
    const deliveringTask = markDeliveringResult(matchingTask);
    setTask(deliveringTask);
    setProcessingStep('正在生成匹配报告...');

    await new Promise((r) => setTimeout(r, 600));

    // 完成
    const completed = markMatchCompleted(deliveringTask);
    setTask(completed);

    setReport({
      profile,
      rankedCandidates,
      summary: rankedCandidates.length > 0
        ? `已生成 ${rankedCandidates.length} 个候选 AI 的匹配排序结果。最推荐 ${rankedCandidates[0].candidate.name}，综合兼容度 ${rankedCandidates[0].compatibility}%。`
        : '当前没有可用候选 AI。'
    });

    // 将匹配结果通过服务端 API 持久化到 Supabase 数据库
    try {
      await fetch('/api/matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          userId: completed.userId,
          profile,
          rankedCandidates,
        })
      });
    } catch {
      // 数据库不可用时不影响用户体验
    }

    setPhase('result');
  }, [task, answers, openAnswer]);

  // 当前问卷题目
  const currentQuestion: QuestionnaireQuestion | undefined = matchingQuestionnaire[currentQIndex];
  const isLastQuestion = currentQIndex >= matchingQuestionnaire.length - 1;

  // ========== 渲染 ==========

  // 欢迎页
  if (phase === 'welcome') {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>华清池 AI 伴侣匹配</h1>
            <p>通过多维问卷分析，智能推荐最契合的 AI 伴侣</p>
          </div>
          <span className="chip">画像 / 兼容度 / 排序</span>
        </section>

        <section className="panel stack">
          {!session ? (
            <div className="panel" style={{ padding: 16 }}>
              <p className="muted">请先登录后再进行匹配。</p>
              <Link className="button" href="/auth?mode=login">去登录</Link>
            </div>
          ) : (
            <>
              <div className="stats">
                <span className="stat">用户: {session.user.username ?? session.user.email}</span>
                <span className="stat">候选 AI 池: {aiCandidates.length} 个</span>
              </div>

              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '4rem', marginBottom: 16 }}>💞</div>
                <h2>找到你的专属 AI 伴侣</h2>
                <p className="muted" style={{ maxWidth: 500, margin: '12px auto' }}>
                  完成一份简短的问卷，我们将从兴趣、人格、情绪需求三个维度，
                  为你推荐最匹配的 AI 伴侣。
                </p>
                <button className="button" onClick={startMatching} style={{ marginTop: 16, fontSize: '1.1rem', padding: '12px 32px' }}>
                  开始匹配问卷
                </button>
              </div>

{/*
               * ========== 匹配流程 (对应 UML 活动图: HuaqingMatchingParentActivity) ==========
               * 1. SubmitMatchRequest → ProcessMatchRequest → ObtainQuestionaryInformation → ProvideQuestionnaire
               * 2. SubmitAnswers → ProcessAnswers → BuildUserProfile
               * 3. GetAIPartnerInformation → ExecuteMatchingAlgorithm → ReturnMatchingReport
               */}
            </>
          )}
        </section>
      </main>
    );
  }

  // 问卷阶段
  if (phase === 'questionnaire' && currentQuestion) {
    const q = currentQuestion;
    const selected = answers[q.id] ?? [];

    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>匹配问卷</h1>
            <p>第 {currentQIndex + 1}/{matchingQuestionnaire.length} 题</p>
          </div>
          <span className="chip">{q.type === 'interests' ? '兴趣' : q.type === 'personality' ? '人格' : q.type === 'needs' ? '需求' : '开放题'}</span>
        </section>

        {/* 问卷进度 */}
        <div style={{
          width: '100%', height: 6, background: 'rgba(255,255,255,0.1)',
          borderRadius: 3, marginBottom: 20, overflow: 'hidden'
        }}>
          <div style={{
            width: `${((currentQIndex + 1) / matchingQuestionnaire.length) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #f59e0b, #fb7185)',
            borderRadius: 3,
            transition: 'width 0.4s ease'
          }} />
        </div>

        <section className="panel stack">
          <h2 style={{ fontSize: '1.3rem', marginBottom: 8 }}>{q.question}</h2>
          {q.multiple && <p className="muted" style={{ fontSize: '0.85rem' }}>（可多选）</p>}

          {q.options ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {q.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <div
                    key={option}
                    onClick={() => q.multiple ? toggleOption(q.id, option) : selectOption(q.id, option)}
                    style={{
                      padding: '14px 18px',
                      borderRadius: 14,
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.14)'}`,
                      background: isSelected ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: q.multiple ? 4 : '50%',
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      background: isSelected ? 'var(--accent)' : 'transparent'
                    }}>
                      {isSelected && <span style={{ color: '#111', fontSize: '0.8rem', fontWeight: 700 }}>✓</span>}
                    </div>
                    <span>{option}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <textarea
              className="field"
              style={{ minHeight: 100, padding: 14, resize: 'vertical' }}
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              placeholder="请输入你的想法..."
            />
          )}

          {/* 导航按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              className="button-ghost"
              onClick={() => {
                if (currentQIndex > 0) setCurrentQIndex((i) => i - 1);
                else setPhase('welcome');
              }}
            >
              {currentQIndex > 0 ? '上一题' : '返回'}
            </button>

            {isLastQuestion ? (
              <button
                className="button"
                onClick={submitQuestionnaire}
                disabled={Object.keys(answers).length === 0}
              >
                提交问卷
              </button>
            ) : (
              <button
                className="button"
                onClick={() => setCurrentQIndex((i) => i + 1)}
              >
                下一题
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  // 处理中
  if (phase === 'processing') {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>正在匹配</h1>
{/*
   * 对应 UML 状态图: Profiling → CandidateRetrieval → Matching → DeliveringResult
   */}
          </div>
          <span className="chip">处理中...</span>
        </section>
        <section className="panel stack" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '3rem', marginBottom: 20 }}>🔍</div>
          <h2>{processingStep}</h2>
          <div style={{
            width: 60, height: 60, margin: '20px auto',
            border: '4px solid rgba(255,255,255,0.1)',
            borderTopColor: '#fb7185',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </section>
      </main>
    );
  }

  // 结果页
  if (phase === 'result' && report) {
    return (
      <main className="shell">
        <section className="page-head">
          <div>
            <h1>匹配结果</h1>
            <p>基于你的兴趣、人格和情绪需求，为你推荐以下 AI 伴侣</p>
          </div>
          <span className="chip">
            {report.rankedCandidates.length} 个推荐
          </span>
        </section>

        {/* 用户画像摘要 */}
        <section className="panel stack">
          <h2>你的偏好画像</h2>
          <div className="stats">
            <span className="stat">🎯 兴趣: {report.profile.interests.join('、') || '未指定'}</span>
            <span className="stat">🧠 人格: {report.profile.personality.join('、') || '未指定'}</span>
            <span className="stat">💝 需求: {report.profile.needs.join('、') || '未指定'}</span>
          </div>
        </section>

        {/* 排名结果 */}
        <section className="panel stack" style={{ marginTop: 16 }}>
          <h2>推荐排序</h2>
          {report.rankedCandidates.map((item, index) => (
            <article
              key={item.candidate.id}
              className="panel"
              style={{
                padding: 20,
                border: index === 0 ? '1px solid rgba(245,158,11,0.4)' : undefined,
                background: index === 0 ? 'rgba(245,158,11,0.04)' : undefined
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: index === 0 ? 'linear-gradient(135deg, #f59e0b, #fb7185)' : 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1.1rem'
                  }}>
                    {index + 1}
                  </span>
                  <div>
                    <h3 style={{ margin: 0 }}>{item.candidate.name}</h3>
                    <div className="stats" style={{ gap: 6, marginTop: 4 }}>
                      {item.candidate.personalityTags.slice(0, 2).map((tag) => (
                        <span key={tag} style={{
                          padding: '2px 8px', borderRadius: 999,
                          background: 'rgba(56,189,248,0.1)',
                          fontSize: '0.8rem', color: '#bae6fd'
                        }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: '2rem', fontWeight: 700,
                  color: item.compatibility >= 80 ? 'var(--success)' : item.compatibility >= 60 ? 'var(--accent)' : 'var(--muted)'
                }}>
                  {item.compatibility}%
                </div>
              </div>

              {/* 雷达图 + 维度分数 */}
              <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* SVG 雷达图 */}
                <div style={{ flex: '0 0 auto' }}>
                  <MatchingRadarChart radar={computeMatchingRadar(item)} size={180} />
                </div>

                {/* 维度分数柱状图 */}
                <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 6 }}>
                  {[
                    { label: '兴趣匹配', value: item.interestScore, max: 25, color: 'var(--accent-2)' },
                    { label: '人格匹配', value: item.personalityScore, max: 25, color: 'var(--accent)' },
                    { label: '情绪适配', value: item.emotionScore, max: 25, color: '#fb7185' },
                    { label: '能力评分', value: item.capabilityScore, max: 25, color: 'var(--success)' }
                  ].map((dim) => (
                    <div key={dim.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 70, fontSize: '0.82rem', color: 'var(--muted)' }}>{dim.label}</span>
                      <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(dim.value / dim.max) * 100}%`,
                          height: '100%',
                          background: dim.color,
                          borderRadius: 4,
                          transition: 'width 0.8s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', width: 28, textAlign: 'right', fontWeight: 600 }}>{dim.value}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', width: 20 }}>/25</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 理由 */}
              <div className="stats" style={{ marginTop: 12 }}>
                {item.reasons.map((reason) => (
                  <span key={reason} className="stat" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                    {reason}
                  </span>
                ))}
              </div>
            </article>
          ))}

          {/* 操作 */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="button" onClick={startMatching}>重新匹配</button>
            <Link className="button-ghost" href="/evaluation">AI 评估</Link>
            <Link className="button-ghost" href="/">返回首页</Link>
          </div>

          {/* 折叠更多信息 */}
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button
              className="button-ghost"
              onClick={() => setShowAllDetails(!showAllDetails)}
            >
              {showAllDetails ? '收起详细比较' : '展开详细比较'}
            </button>
          </div>

          {showAllDetails && (
            <div className="panel" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>AI 名称</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>综合分</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>兴趣</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>人格</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>情绪</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>能力</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>标签</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rankedCandidates.map((item) => (
                    <tr key={item.candidate.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 10 }}><strong>{item.candidate.name}</strong></td>
                      <td style={{ padding: 10, textAlign: 'center', fontWeight: 700 }}>{item.compatibility}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>{item.interestScore}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>{item.personalityScore}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>{item.emotionScore}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>{item.capabilityScore}</td>
                      <td style={{ padding: 10, fontSize: '0.85rem' }}>
                        {item.candidate.interestTags.slice(0, 2).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 摘要 */}
        <section className="panel stack" style={{ marginTop: 16 }}>
          <h2>匹配摘要</h2>
          <p style={{ lineHeight: 1.8 }}>{report.summary}</p>
        </section>
      </main>
    );
  }

  return null;
}

// ========== 匹配雷达图 SVG 组件 ==========

function MatchingRadarChart({ radar, size = 180 }: { radar: MatchingRadarDimensions; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const levels = 5;

  const dimensions = Object.keys(radar) as (keyof MatchingRadarDimensions)[];
  const dimCount = dimensions.length;
  const angleSlice = (2 * Math.PI) / dimCount;

  // 维度标签颜色
  const dimColors: Record<string, string> = {
    '兴趣匹配': '#38bdf8',
    '人格匹配': '#f59e0b',
    '情绪适配': '#fb7185',
    '能力评分': '#22c55e',
    '逻辑推理': '#a78bfa',
    '共情能力': '#f472b6'
  };

  const getPoint = (index: number, value: number) => {
    const angle = angleSlice * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  };

  const getLevelPoint = (index: number, level: number) => {
    const angle = angleSlice * index - Math.PI / 2;
    const r = (level / levels) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  };

  const dataPoints = dimensions.map((dim, i) => getPoint(i, radar[dim]));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 网格 */}
      {Array.from({ length: levels }, (_, level) => {
        const points = dimensions
          .map((_, i) => getLevelPoint(i, level + 1))
          .map((p) => `${p.x},${p.y}`)
          .join(' ');
        return (
          <polygon
            key={`grid-${level}`}
            points={points}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* 轴线 */}
      {dimensions.map((_, i) => {
        const point = getLevelPoint(i, levels);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={point.x}
            y2={point.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      {/* 数据多边形 */}
      <polygon
        points={polygonPoints}
        fill="rgba(56,189,248,0.12)"
        stroke="rgba(56,189,248,0.6)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={p.x}
          cy={p.y}
          r={4}
          fill={dimColors[dimensions[i]] ?? 'var(--accent)'}
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}

      {/* 维度标签 */}
      {dimensions.map((dim, i) => {
        const labelPoint = getLevelPoint(i, levels + 1.2);
        return (
          <text
            key={`label-${i}`}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={dimColors[dim] ?? 'var(--muted)'}
            fontSize={11}
            fontWeight={600}
          >
            {dim}
          </text>
        );
      })}
    </svg>
  );
}