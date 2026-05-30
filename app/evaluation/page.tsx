"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readAuthSession, type AuthSessionState } from '@/lib/auth-session';

export default function EvaluationPage() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [report, setReport] = useState<{
    score: { iq: number; eq: number; overall: number };
    status: string;
    selectedQuestions: { id: string; prompt: string }[];
    conclusion: string;
  } | null>(null);

  useEffect(() => {
    const currentSession = readAuthSession();
    setSession(currentSession);
  }, []);

  useEffect(() => {
    async function loadReport() {
      if (!session?.user?.id) {
        setReport(null);
        return;
      }

      const response = await fetch(`/api/evaluation?userId=${encodeURIComponent(session.user.id)}&type=iq_eq`);
      const data = (await response.json()) as {
        ok: boolean;
        report?: {
          score: { iq: number; eq: number; overall: number };
          status: string;
          selectedQuestions: { id: string; prompt: string }[];
          conclusion: string;
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
          <h1>AI 智商 / 情商评估</h1>
          <p>映射 UML 的 EvaluationTask 状态机、EvaluationServer 编排与 EvaluationManager 评分逻辑。</p>
        </div>
        <span className="chip">评估 / 循环 / 汇总</span>
      </section>

      <section className="panel stack">
        <div className="stats">
          {session ? (
            <>
              <span className="stat">用户: {session.user.username ?? session.user.email ?? session.user.id}</span>
              <span className="stat">IQ: {report?.score.iq ?? '--'}</span>
              <span className="stat">EQ: {report?.score.eq ?? '--'}</span>
              <span className="stat">Overall: {report?.score.overall ?? '--'}</span>
              <span className="stat">Status: {report?.status ?? 'loading'}</span>
            </>
          ) : (
            <span className="stat">请先登录后再查看评估结果</span>
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
            <li>RequestEvaluation 创建任务与 Session。</li>
            <li>进入取题、提交回答、评分、保存中间结果的循环。</li>
            <li>结束后汇总所有中间结果并输出评估报告。</li>
          </ol>
        </div>

        <div>
          <h3>示例题目</h3>
          <ul className="muted">
            {report?.selectedQuestions.map((question) => (
              <li key={question.id}>{question.prompt}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3>结论</h3>
          <p>{report?.conclusion ?? '当前评估结果未生成。'}</p>
        </div>
      </section>
    </main>
  );
}