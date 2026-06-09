/*
 * ==========================================================================
 * 管理员匹配管理 API — 连接 Supabase 真实数据库
 * ==========================================================================
 * GET:  获取所有匹配任务列表、候选 AI 池
 * POST: 管理匹配任务 (更新状态、删除任务)、管理候选 AI
 * ==========================================================================
 */

import { NextResponse } from 'next/server';
import {
  adminReadMatchingSessions,
  adminReadAllCandidates,
  adminDeleteCandidate,
  adminDeleteMatchingSession,
  adminUpdateMatchingSession,
  upsertAiCandidate,
} from '@/lib/supabase';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 获取候选 AI 列表 (所有, 含非激活)
  if (action === 'candidates') {
    const candidates = await adminReadAllCandidates();
    return NextResponse.json({ ok: true, candidates, total: candidates.length });
  }

  // 获取匹配任务列表 (真实数据)
  if (action === 'tasks') {
    const status = url.searchParams.get('status') ?? undefined;
    const tasks = await adminReadMatchingSessions(status);
    return NextResponse.json({ ok: true, tasks, total: tasks.length });
  }

  // 默认返回概览
  const allTasks = await adminReadMatchingSessions();
  const allCandidates = await adminReadAllCandidates();
  return NextResponse.json({
    ok: true,
    overview: {
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter((t) => t.status === 'completed').length,
      activeTasks: allTasks.filter((t) => t.status === 'matching' || t.status === 'profiling').length,
      totalCandidates: allCandidates.length,
    }
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    taskId?: string;
    status?: string;
    candidate?: {
      id: string; name: string; description: string;
      personalityTags: string[]; interestTags: string[]; emotionTags: string[];
      capabilityScore: number; modelId?: string;
    };
  };

  // 更新任务状态
  if (body.action === 'update-task' && body.taskId) {
    if (!body.status) {
      return NextResponse.json({ ok: false, error: '需要提供状态。' }, { status: 400 });
    }
    const { error } = await adminUpdateMatchingSession(body.taskId, body.status);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 删除任务
  if (body.action === 'delete-task' && body.taskId) {
    const { error } = await adminDeleteMatchingSession(body.taskId);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 添加/更新候选 AI
  if (body.action === 'upsert-candidate' && body.candidate) {
    const c = body.candidate;
    if (!c.id || !c.name) {
      return NextResponse.json({ ok: false, error: '候选AI的ID和名称不能为空。' }, { status: 400 });
    }
    const { error } = await upsertAiCandidate({
      id: c.id,
      name: c.name,
      personalityTags: c.personalityTags,
      interestTags: c.interestTags,
      emotionTags: c.emotionTags,
      capabilityScore: c.capabilityScore,
      modelId: c.modelId,
      description: c.description,
    });
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 删除候选 AI
  if (body.action === 'delete-candidate') {
    const candidateId = body.taskId; // 复用 taskId 字段传 candidateId
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: '需要提供候选AI的ID。' }, { status: 400 });
    }
    const { error } = await adminDeleteCandidate(candidateId);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: '无效的操作。' }, { status: 400 });
}
