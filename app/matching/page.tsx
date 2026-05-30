"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readAuthSession, type AuthSessionState } from '@/lib/auth-session';

export default function MatchingPage() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [report, setReport] = useState<{
    status: string;
    rankedCandidates: { candidate: { id: string; name: string }; compatibility: number; reasons: string[] }[];
  } | null>(null);

  useEffect(() => {
    setSession(readAuthSession());
  }, []);

  useEffect(() => {
    async function loadReport() {
      if (!session?.user?.id) {
        setReport(null);
        return;
      }

      const response = await fetch(`/api/matching?userId=${encodeURIComponent(session.user.id)}`);
      const data = (await response.json()) as {
        ok: boolean;
        report?: {
          status: string;
          rankedCandidates: { candidate: { id: string; name: string }; compatibility: number; reasons: string[] }[];
        };
      };

      setReport(data.report ?? null);
    }

    void loadReport();
  }, [session]);

  return (
    <main className="shell">
      <section className="page-head">
        <div>
          <h1>华清池 AI 伴侣匹配</h1>
          <p>对应 UML 中的 QuestionnairePending、Profiling、CandidateRetrieval、Matching 与 DeliveringResult 状态流转。</p>
        </div>
        <span className="chip">画像 / 兼容度 / 排序</span>
      </section>

      <section className="panel stack">
        <div className="stats">
          {session ? (
            <>
              <span className="stat">用户: {session.user.username ?? session.user.email ?? session.user.id}</span>
              <span className="stat">Status: {report?.status ?? 'loading'}</span>
              <span className="stat">Candidates: {report?.rankedCandidates.length ?? '--'}</span>
            </>
          ) : (
            <span className="stat">请先登录后再查看匹配结果</span>
          )}
        </div>

        {!session ? (
          <div className="panel" style={{ padding: 16 }}>
            <p className="muted">当前没有检测到登录态，请先登录。</p>
            <Link className="button" href="/login">
              去登录
            </Link>
          </div>
        ) : null}

        <div>
          <h2>流程说明</h2>
          <ol className="muted">
            <li>用户提交匹配请求并完成问卷。</li>
            <li>系统构建用户画像并提取候选 AI。</li>
            <li>按兴趣、人格和情绪需求计算兼容度。</li>
            <li>输出排序后的匹配报告。</li>
          </ol>
        </div>

        <div>
          <h3>推荐结果</h3>
          <div className="stack">
            {report?.rankedCandidates.map((item) => (
              <article className="grid-card" key={item.candidate.id}>
                <h3>
                  {item.candidate.name} · {item.compatibility}
                </h3>
                <p>{item.reasons.join(' / ')}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}