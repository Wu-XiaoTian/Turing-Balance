/*
 * ==========================================================================
 * 管理员评估管理 API — 连接 Supabase 真实数据库
 * ==========================================================================
 * GET:  获取所有评估任务列表、题库
 * POST: 管理评估任务 (更新状态、删除任务)、管理题库
 * ==========================================================================
 */

import { NextResponse } from 'next/server';
import {
  adminReadEvaluationSessions,
  adminReadAllQuestions,
  adminDeleteQuestion,
  adminDeleteEvaluationSession,
  adminUpdateEvaluationSession,
  upsertEvaluationQuestion,
} from '@/lib/supabase';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 获取题库 (所有题目, 含非激活)
  if (action === 'questions') {
    const questions = await adminReadAllQuestions();
    return NextResponse.json({ ok: true, questions, total: questions.length });
  }

  // 获取评估任务列表 (真实数据)
  if (action === 'tasks') {
    const status = url.searchParams.get('status') ?? undefined;
    const tasks = await adminReadEvaluationSessions(status);
    return NextResponse.json({ ok: true, tasks, total: tasks.length });
  }

  // 默认返回概览
  const allTasks = await adminReadEvaluationSessions();
  const allQuestions = await adminReadAllQuestions();
  return NextResponse.json({
    ok: true,
    overview: {
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter((t) => t.status === 'completed').length,
      activeTasks: allTasks.filter((t) => t.status === 'evaluating').length,
      totalQuestions: allQuestions.length,
    }
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    taskId?: string;
    status?: string;
    question?: { id: string; title: string; type: string; dimension: string; prompt: string; difficulty: number; sortOrder?: number };
  };

  // 更新任务状态
  if (body.action === 'update-task' && body.taskId) {
    if (!body.status) {
      return NextResponse.json({ ok: false, error: '需要提供状态。' }, { status: 400 });
    }
    const { error } = await adminUpdateEvaluationSession(body.taskId, body.status);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 删除任务
  if (body.action === 'delete-task' && body.taskId) {
    const { error } = await adminDeleteEvaluationSession(body.taskId);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 添加/更新题目
  if (body.action === 'upsert-question' && body.question) {
    const q = body.question;
    if (!q.id || !q.title || !q.prompt) {
      return NextResponse.json({ ok: false, error: '题目ID、标题和内容不能为空。' }, { status: 400 });
    }
    const { error } = await upsertEvaluationQuestion({
      id: q.id,
      title: q.title,
      type: q.type as 'iq' | 'eq' | 'iq_eq',
      dimension: q.dimension as 'iq' | 'eq' | 'hybrid',
      prompt: q.prompt,
      difficulty: q.difficulty,
      sortOrder: q.sortOrder ?? 0,
    });
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 删除题目
  if (body.action === 'delete-question') {
    const questionId = body.taskId; // 复用 taskId 字段传 questionId
    if (!questionId) {
      return NextResponse.json({ ok: false, error: '需要提供题目ID。' }, { status: 400 });
    }
    const { error } = await adminDeleteQuestion(questionId);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '无效的操作。' }, { status: 400 });
}
