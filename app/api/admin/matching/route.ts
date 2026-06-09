/*
 * ==========================================================================
 * 管理员匹配管理 API
 * ==========================================================================
 * GET:  获取所有匹配任务列表、候选 AI 池
 * POST: 管理匹配任务 (更新状态、删除任务)、管理候选 AI
 * ==========================================================================
 */

import { NextResponse } from 'next/server';
import { aiCandidates } from '@/lib/mock-data';

// 模拟匹配任务存储（内存中）
const mockMatchTasks = [
  { id: 'match-001', userId: 'u1', userName: '张三', status: 'completed', topMatch: '小薇 (温柔型)', topScore: 92, createdAt: '2026-05-25T08:00:00Z' },
  { id: 'match-002', userId: 'u2', userName: '李四', status: 'completed', topMatch: '阿理 (逻辑型)', topScore: 88, createdAt: '2026-05-26T13:30:00Z' },
  { id: 'match-003', userId: 'u5', userName: '孙七', status: 'matching', createdAt: '2026-05-27T10:00:00Z' },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 获取候选 AI 列表
  if (action === 'candidates') {
    return NextResponse.json({ ok: true, candidates: aiCandidates, total: aiCandidates.length });
  }

  // 获取匹配任务列表
  if (action === 'tasks') {
    const status = url.searchParams.get('status');
    let tasks = mockMatchTasks;
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }
    return NextResponse.json({ ok: true, tasks, total: tasks.length });
  }

  // 默认返回概览
  return NextResponse.json({
    ok: true,
    overview: {
      totalTasks: mockMatchTasks.length,
      completedTasks: mockMatchTasks.filter((t) => t.status === 'completed').length,
      activeTasks: mockMatchTasks.filter((t) => t.status === 'matching' || t.status === 'profiling').length,
      totalCandidates: aiCandidates.length,
    }
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    taskId?: string;
    status?: string;
    candidate?: { id: string; name: string; description: string; tags: string[]; personality: string[]; interests: string[]; emotionFocus: string[] };
  };

  // 更新任务状态
  if (body.action === 'update-task' && body.taskId) {
    const task = mockMatchTasks.find((t) => t.id === body.taskId);
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
    const idx = mockMatchTasks.findIndex((t) => t.id === body.taskId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: '任务不存在。' }, { status: 404 });
    }
    mockMatchTasks.splice(idx, 1);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '无效的操作。' }, { status: 400 });
}
