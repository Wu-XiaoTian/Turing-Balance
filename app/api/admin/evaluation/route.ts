/*
 * ==========================================================================
 * 管理员评估管理 API
 * ==========================================================================
 * GET:  获取所有评估任务列表、题库
 * POST: 管理评估任务 (更新状态、删除任务)
 * ==========================================================================
 */

import { NextResponse } from 'next/server';
import { evaluationQuestions } from '@/lib/mock-data';

// 模拟评估任务存储（内存中）
const mockEvalTasks = [
  { id: 'task-001', userId: 'u1', userName: '张三', type: 'iq_eq', modelId: 'deepseek-v4-pro-260425', status: 'completed', score: { iq: 85, eq: 78, overall: 82 }, createdAt: '2026-05-20T10:30:00Z' },
  { id: 'task-002', userId: 'u2', userName: '李四', type: 'iq', modelId: 'doubao-seed-2-0-lite-260428', status: 'completed', score: { iq: 72, eq: 0, overall: 72 }, createdAt: '2026-05-21T14:00:00Z' },
  { id: 'task-003', userId: 'u3', userName: '王五', type: 'eq', modelId: 'glm-4-7-251222', status: 'evaluating', createdAt: '2026-05-22T09:15:00Z' },
  { id: 'task-004', userId: 'u1', userName: '张三', type: 'iq_eq', modelId: 'deepseek-v3-2-251201', status: 'cancelled', createdAt: '2026-05-23T16:45:00Z' },
  { id: 'task-005', userId: 'u4', userName: '赵六', type: 'iq_eq', modelId: 'doubao-seed-2-0-code-preview-260215', status: 'completed', score: { iq: 91, eq: 84, overall: 88 }, createdAt: '2026-05-24T11:20:00Z' },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 获取题库
  if (action === 'questions') {
    return NextResponse.json({ ok: true, questions: evaluationQuestions, total: evaluationQuestions.length });
  }

  // 获取评估任务列表
  if (action === 'tasks') {
    const status = url.searchParams.get('status');
    let tasks = mockEvalTasks;
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }
    return NextResponse.json({ ok: true, tasks, total: tasks.length });
  }

  // 默认返回概览
  return NextResponse.json({
    ok: true,
    overview: {
      totalTasks: mockEvalTasks.length,
      completedTasks: mockEvalTasks.filter((t) => t.status === 'completed').length,
      activeTasks: mockEvalTasks.filter((t) => t.status === 'evaluating').length,
      totalQuestions: evaluationQuestions.length,
    }
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    taskId?: string;
    status?: string;
    question?: { id: string; title: string; type: string; dimension: string; prompt: string; difficulty: number };
  };

  // 更新任务状态
  if (body.action === 'update-task' && body.taskId) {
    const task = mockEvalTasks.find((t) => t.id === body.taskId);
    if (!task) {
      return NextResponse.json({ ok: false, error: '任务不存在。' }, { status: 404 });
    }
    if (body.status) {
      task.status = body.status;
    }
    return NextResponse.json({ ok: true, task });
  }

  // 删除任务
  if (body.action === 'delete-task' && body.taskId) {
    const idx = mockEvalTasks.findIndex((t) => t.id === body.taskId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: '任务不存在。' }, { status: 404 });
    }
    mockEvalTasks.splice(idx, 1);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '无效的操作。' }, { status: 400 });
}
