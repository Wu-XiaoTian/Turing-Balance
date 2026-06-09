/*
 * ==========================================================================
 * Supabase 数据访问层 — 对应 UML 类图中的数据层
 * ==========================================================================
 * 核心映射:
 *   UserDatabase    → profiles 表 (readUserProfile, registerSupabaseUser...)
 *   QuestionRepository → evaluation_questions 表 (readEvaluationQuestions)
 *   ImperialConcubineDatabase → ai_candidates 表 (readAiCandidates)
 *   SystemParameter → system_parameters 表 (readSystemParameters, upsertSystemParameter)
 *
 * 评估/匹配 Session 写入:
 *   writeEvaluationSession → evaluation_tasks 表
 *   writeMatchingSession    → matching_tasks 表
 * ==========================================================================
 */

import { createClient } from '@supabase/supabase-js';
import type { CandidateAI, EvaluationQuestion, EvaluationType, SystemParameter } from './types';

type EnvMap = Record<string, string | undefined>;

function getEnv() {
  const nodeProcess = (globalThis as unknown as { process?: { env?: EnvMap } }).process;
  return nodeProcess?.env ?? {};
}

const supabaseEnv = getEnv();
const supabaseUrl = supabaseEnv.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = supabaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabaseServiceRoleKey = supabaseEnv.SUPABASE_SERVICE_ROLE_KEY ?? '';

export interface SupabaseProfile {
  id: string;
  username: string;
  email: string;
  phone_number?: string;
  role: 'user' | 'evaluator' | 'administrator';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface SupabaseSessionUser {
  id: string;
  email: string | null;
  phone?: string | null;
  user_metadata?: {
    username?: string;
  };
}

export interface SupabaseAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseSessionUser;
}

/**
 * 解析 Supabase 错误响应 JSON，返回用户可读的中文错误信息。
 * 处理注册错误（admin API）和登录错误（token API）两种格式：
 *   {"code":422,"error_code":"email_exists","msg":"..."}
 *   {"error":"invalid_grant","error_description":"Invalid login credentials"}
 */
function parseSupabaseError(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText);
    const code: string | undefined = parsed.error_code ?? parsed.code;
    const msg: string | undefined = parsed.msg;
    const errorDescription: string | undefined = parsed.error_description;
    const errorField: string | undefined = parsed.error;

    // ---- 注册相关错误（admin API） ----
    if (code === 'email_exists' || msg?.includes?.('already been registered')) {
      return '该邮箱已被注册，请直接登录。';
    }
    if (code === 'user_exists' || code === 'username_exists' || msg?.includes?.('already exists')) {
      return '该用户名已被使用，请换一个。';
    }
    if (code === 'weak_password' || msg?.includes?.('password')) {
      return '密码强度不足，请使用更复杂的密码。';
    }
    if (code === 'validation_error') {
      return '输入信息格式有误，请检查后重试。';
    }

    // ---- 登录相关错误（token API） ----
    if (errorField === 'invalid_grant') {
      if (errorDescription?.includes?.('Invalid login credentials')) {
        return '邮箱/手机号或密码错误，请重新输入。';
      }
      if (errorDescription?.includes?.('Email not confirmed') || errorDescription?.includes?.('email_not_confirmed')) {
        return '邮箱尚未验证，请先查收验证邮件。';
      }
      if (errorDescription?.includes?.('phone_not_confirmed')) {
        return '手机号尚未验证。';
      }
      // 其他 grant 错误
      if (errorDescription) {
        return errorDescription;
      }
      return '邮箱/手机号或密码错误，请重新输入。';
    }

    // ---- 通用兜底：有 msg 字段则直接使用 ----
    if (msg) {
      return msg;
    }
    if (errorDescription) {
      return errorDescription;
    }
  } catch {
    // 不是 JSON，直接返回原文
  }
  return errorText;
}

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** 创建 Supabase 浏览器客户端 (使用 anon key) */
export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

/** 创建 Supabase 服务端客户端 (使用 anon key, 适合 Next.js Route Handler) */
export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/** 创建 Supabase 管理员客户端 (使用 service role key) */
export function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ============ 遗留的 REST fetch 方法（保持向后兼容） ============

function buildHeaders(apiKey: string, bearerToken?: string, returnRepresentation = false): HeadersInit {
  return {
    apikey: apiKey,
    authorization: `Bearer ${bearerToken ?? apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
    ...(returnRepresentation ? { prefer: 'return=representation' } : {})
  };
}

export async function fetchJson<T>(path: string, init: RequestInit): Promise<{ data: T | null; error: string | null }> {
  if (!supabaseUrl) {
    return { data: null, error: 'Supabase URL 未配置。' };
  }

  const response = await fetch(`${supabaseUrl}${path}`, init);
  const text = await response.text();

  if (!response.ok) {
    return { data: null, error: text || response.statusText };
  }

  if (!text) {
    return { data: null, error: null };
  }

  return { data: JSON.parse(text) as T, error: null };
}

export async function registerSupabaseUser(input: { username: string; email: string; password: string }) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { data: null, error: 'Supabase 服务端配置缺失。' };
  }

  const existing = await fetchJson<SupabaseProfile[]>(
    `/rest/v1/profiles?select=id&or=(email.eq.${encodeURIComponent(input.email)},username.eq.${encodeURIComponent(
      input.username
    )})&limit=1`,
    {
      method: 'GET',
      headers: buildHeaders(supabaseServiceRoleKey)
    }
  );

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if ((existing.data ?? []).length > 0) {
    return { data: null, error: '用户名或邮箱已存在。' };
  }

  const authBody: Record<string, unknown> = {
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { username: input.username }
  };

  // Supabase GoTrue Admin API 直接返回用户对象，而非 { user: ... } 嵌套格式
  const authResult = await fetchJson<SupabaseSessionUser>(`/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey),
    body: JSON.stringify(authBody)
  });

  if (authResult.error || !authResult.data?.id) {
    const readableError = authResult.error ? parseSupabaseError(authResult.error) : '创建用户失败，请稍后重试。';
    return { data: null, error: readableError };
  }

  const profileBody: Record<string, unknown> = {
    id: authResult.data.id,
    username: input.username,
    email: input.email,
    role: 'user'
  };

  const profileInsert = await fetchJson<unknown>(`/rest/v1/profiles`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey),
    body: JSON.stringify(profileBody)
  });

  if (profileInsert.error) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${authResult.data.id}`, {
      method: 'DELETE',
      headers: buildHeaders(supabaseServiceRoleKey)
    });

    return { data: null, error: profileInsert.error };
  }

  return {
    data: {
      id: authResult.data.id,
      username: input.username,
      email: input.email,
      role: 'user' as const
    },
    error: null
  };
}

export async function signInSupabaseUser(input: { email: string; password: string } | { phone: string; password: string }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: 'Supabase 公钥配置缺失。' };
  }

  const body: Record<string, string> = { password: input.password };
  if ('email' in input) {
    body.email = input.email;
  } else {
    body.phone = input.phone;
  }

  const authResult = await fetchJson<{ access_token: string; refresh_token: string; expires_in: number; token_type: string; user: SupabaseSessionUser }>(
    `/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: buildHeaders(supabaseAnonKey),
      body: JSON.stringify(body)
    }
  );

  if (authResult.error || !authResult.data) {
    const readableError = authResult.error ? parseSupabaseError(authResult.error) : '登录失败，请稍后重试。';
    return { data: null, error: readableError };
  }

  return { data: authResult.data, error: null };
}

export async function readUserProfile(userId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  const { data, error } = await fetchJson<SupabaseProfile[]>(
    `/rest/v1/profiles?select=id,username,email,role,created_at,updated_at,last_login_at&id=eq.${encodeURIComponent(
      userId
    )}&limit=1`,
    {
      method: 'GET',
      headers: buildHeaders(supabaseServiceRoleKey)
    }
  );

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
}

export async function touchUserLastLogin(userId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { error: 'Supabase 服务端配置缺失。' };
  }

  const { error } = await fetchJson<unknown>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(supabaseServiceRoleKey),
      body: JSON.stringify({ last_login_at: new Date().toISOString() })
    }
  );

  return { error };
}

export interface EvaluationQuestionRow {
  id: string;
  title: string;
  type: EvaluationType;
  dimension: 'iq' | 'eq' | 'hybrid';
  prompt: string;
  difficulty: number;
  active: boolean;
  sort_order: number;
}

export interface EvaluationAnswerRow {
  session_id: string;
  question_id: string;
  answer: string;
  score_iq: number;
  score_eq: number;
}

export interface AiCandidateRow {
  id: string;
  name: string;
  personality_tags: string[];
  interest_tags: string[];
  emotion_tags: string[];
  capability_score: number;
  ai_model_id?: string;
  description?: string;
  evaluation_count?: number;
  active: boolean;
}

function mapQuestion(row: EvaluationQuestionRow): EvaluationQuestion {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    dimension: row.dimension,
    prompt: row.prompt,
    difficulty: row.difficulty as 1 | 2 | 3 | 4 | 5
  };
}

function mapCandidate(row: AiCandidateRow): CandidateAI {
  return {
    id: row.id,
    name: row.name,
    personalityTags: row.personality_tags,
    interestTags: row.interest_tags,
    emotionTags: row.emotion_tags,
    capabilityScore: row.capability_score,
    modelId: (row.ai_model_id as CandidateAI['modelId']) ?? undefined,
    description: row.description
  };
}

export async function readEvaluationQuestions(type: EvaluationType) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [] as EvaluationQuestion[];
  }

  const { data, error } = await fetchJson<EvaluationQuestionRow[]>(
    `/rest/v1/evaluation_questions?select=id,title,type,dimension,prompt,difficulty,active,sort_order&active=eq.true&order=sort_order.asc`,
    { method: 'GET', headers: buildHeaders(supabaseAnonKey) }
  );

  if (error || !data) {
    return [] as EvaluationQuestion[];
  }

  return data.filter((row) => type === 'iq_eq' || row.type === type).map(mapQuestion);
}

export async function readAiCandidates() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [] as CandidateAI[];
  }

  const { data, error } = await fetchJson<AiCandidateRow[]>(
    `/rest/v1/ai_candidates?select=id,name,personality_tags,interest_tags,emotion_tags,capability_score,ai_model_id,description,active&active=eq.true&order=capability_score.desc`,
    { method: 'GET', headers: buildHeaders(supabaseAnonKey) }
  );

  if (error || !data) {
    return [] as CandidateAI[];
  }

  return data.map(mapCandidate);
}

export async function writeEvaluationSession(input: {
  userId: string;
  evaluationType: EvaluationType;
  status: string;
  scoreIq: number;
  scoreEq: number;
  scoreOverall: number;
  reportJson: unknown;
  modelId?: string;
}) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  const { data, error } = await fetchJson<Array<{ id: string }>>(`/rest/v1/evaluation_sessions`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify({
      user_id: input.userId,
      evaluation_type: input.evaluationType,
      ai_model_id: input.modelId ?? null,
      status: input.status,
      score_iq: input.scoreIq,
      score_eq: input.scoreEq,
      score_overall: input.scoreOverall,
      report_json: input.reportJson
    })
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
}

export async function writeEvaluationAnswers(input: { sessionId: string; answers: EvaluationAnswerRow[] }) {
  if (!supabaseUrl || !supabaseServiceRoleKey || input.answers.length === 0) {
    return;
  }

  await fetchJson<Array<{ id: string }>>(`/rest/v1/evaluation_answers`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify(
      input.answers.map((answer) => ({
        session_id: input.sessionId,
        question_id: answer.question_id,
        answer: answer.answer,
        score_iq: answer.score_iq,
        score_eq: answer.score_eq
      }))
    )
  });
}

export async function writeMatchingSession(input: {
  userId: string;
  status: string;
  profileJson: unknown;
  resultJson: unknown;
}) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  const { data, error } = await fetchJson<Array<{ id: string }>>(`/rest/v1/matching_sessions`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify({
      user_id: input.userId,
      status: input.status,
      profile_json: input.profileJson,
      result_json: input.resultJson
    })
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
}

export async function readOrFallbackUserProfile(userId: string) {
  return readUserProfile(userId);
}

// ============ 系统参数管理 (对应 UML: SystemParameter) ============

export async function readSystemParameters() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return [] as SystemParameter[];
  }

  const { data, error } = await fetchJson<Array<{ key: string; value: string; description: string | null; updated_by: string | null; updated_at: string | null }>>(
    `/rest/v1/system_parameters?select=key,value,description,updated_by,updated_at&order=key.asc`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );

  if (error || !data) return [] as SystemParameter[];

  return data.map((row) => ({
    key: row.key,
    value: parseParamValue(row.value),
    description: row.description ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    updatedAt: row.updated_at ?? undefined
  })) as SystemParameter[];
}

export async function readSystemParameter(key: string) {
  const params = await readSystemParameters();
  return params.find((p) => p.key === key) ?? null;
}

export async function upsertSystemParameter(input: { key: string; value: string; description?: string; updatedBy?: string }) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { error: 'Supabase 服务端配置缺失。' };
  }

  const { error } = await fetchJson<unknown>(`/rest/v1/system_parameters`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify({
      key: input.key,
      value: String(input.value),
      description: input.description ?? null,
      updated_by: input.updatedBy ?? null
    })
  });

  return { error };
}

function parseParamValue(value: string): string | number | boolean | Record<string, unknown> {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+\.?\d*$/.test(value)) return Number(value);
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return value;
  }
}

// ============ 问卷/题库管理 ============

export async function upsertEvaluationQuestion(input: {
  id: string;
  title: string;
  type: EvaluationType;
  dimension: 'iq' | 'eq' | 'hybrid';
  prompt: string;
  difficulty: number;
  sortOrder: number;
  active?: boolean;
}) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { error: 'Supabase 服务端配置缺失。' };
  }

  const { error } = await fetchJson<unknown>(`/rest/v1/evaluation_questions`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify({
      id: input.id,
      title: input.title,
      type: input.type,
      dimension: input.dimension,
      prompt: input.prompt,
      difficulty: input.difficulty,
      sort_order: input.sortOrder,
      active: input.active ?? true
    })
  });

  return { error };
}

// ============ AI 候选管理 ============

export async function upsertAiCandidate(input: {
  id: string;
  name: string;
  personalityTags: string[];
  interestTags: string[];
  emotionTags: string[];
  capabilityScore: number;
  modelId?: string;
  description?: string;
  active?: boolean;
}) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { error: 'Supabase 服务端配置缺失。' };
  }

  const { error } = await fetchJson<unknown>(`/rest/v1/ai_candidates`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey, undefined, true),
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      personality_tags: JSON.stringify(input.personalityTags),
      interest_tags: JSON.stringify(input.interestTags),
      emotion_tags: JSON.stringify(input.emotionTags),
      capability_score: input.capabilityScore,
      ai_model_id: input.modelId ?? null,
      description: input.description ?? null,
      active: input.active ?? true
    })
  });

  return { error };
}

// ============ 评估分数同步到 AI 候选 (带平均值计算) ============

/**
 * 将评估结果同步到 AI 候选的能力评分。
 * 如果候选已有评分，则与已有分数取平均值后入库。
 * capabilityScore 采用加权平均：新分数权重 = 1, 历史分数权重 = evaluation_count
 *
 * @param modelId  火山引擎 AI 模型 ID (如 deepseek-v4-pro-260425)
 * @param newIqScore  本次评估 IQ 分数
 * @param newEqScore  本次评估 EQ 分数
 * @returns 更新后的 capabilityScore (0-100)
 */
export async function syncEvaluationScoreToCandidate(
  modelId: string,
  newIqScore: number,
  newEqScore: number
): Promise<{ capabilityScore: number; error: string | null }> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    // 无数据库时直接返回新分数
    const rawScore = Math.round((newIqScore * 0.55 + newEqScore * 0.45));
    return { capabilityScore: Math.min(100, Math.max(0, rawScore)), error: null };
  }

  // 综合能力分 = IQ×0.55 + EQ×0.45
  const newCapability = Math.round(newIqScore * 0.55 + newEqScore * 0.45);

  // 1. 查找该 modelId 对应的候选
  const { data: candidates, error: readError } = await fetchJson<AiCandidateRow[]>(
    `/rest/v1/ai_candidates?select=id,capability_score,evaluation_count&ai_model_id=eq.${encodeURIComponent(modelId)}&limit=1`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );

  if (readError || !candidates || candidates.length === 0) {
    // 没有对应候选，直接返回新分数
    return { capabilityScore: Math.min(100, Math.max(0, newCapability)), error: null };
  }

  const candidate = candidates[0];
  const oldScore = candidate.capability_score ?? 0;
  const oldCount = candidate.evaluation_count ?? 0;

  // 2. 计算加权平均分
  // 如果已有数据，新分数与历史分数取平均
  let avgScore: number;
  if (oldCount > 0 && oldScore > 0) {
    // 加权平均: (oldScore * oldCount + newCapability) / (oldCount + 1)
    avgScore = Math.round((oldScore * oldCount + newCapability) / (oldCount + 1));
  } else {
    avgScore = newCapability;
  }
  avgScore = Math.min(100, Math.max(0, avgScore));

  // 3. 更新候选评分
  const { error: updateError } = await fetchJson<unknown>(
    `/rest/v1/ai_candidates?id=eq.${encodeURIComponent(candidate.id)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(supabaseServiceRoleKey),
      body: JSON.stringify({
        capability_score: avgScore,
        evaluation_count: oldCount + 1
      })
    }
  );

  if (updateError) {
    return { capabilityScore: avgScore, error: updateError };
  }

  return { capabilityScore: avgScore, error: null };
}

// ============ 管理员专用查询 (使用 service role key 绕过 RLS) ============

/** 管理员获取所有评估会话 (含用户信息) */
export async function adminReadEvaluationSessions(statusFilter?: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return [];

  let query = `/rest/v1/evaluation_sessions?select=id,user_id,evaluation_type,ai_model_id,status,score_iq,score_eq,score_overall,created_at,updated_at&order=created_at.desc`;
  if (statusFilter) {
    query += `&status=eq.${encodeURIComponent(statusFilter)}`;
  }

  const { data: sessions, error } = await fetchJson<Array<{
    id: string; user_id: string; evaluation_type: string; ai_model_id: string | null;
    status: string; score_iq: number; score_eq: number; score_overall: number;
    created_at: string; updated_at: string;
  }>>(query, { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) });

  if (error || !sessions) return [];

  // 批量获取用户名
  const userIds = [...new Set(sessions.map((s) => s.user_id))];
  const { data: profiles } = await fetchJson<Array<{ id: string; username: string }>>(
    `/rest/v1/profiles?select=id,username&id=in.(${userIds.map((id) => encodeURIComponent(id)).join(',')})`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  const userMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return sessions.map((s) => ({
    id: s.id,
    userId: s.user_id,
    userName: userMap.get(s.user_id) ?? '未知用户',
    type: s.evaluation_type,
    modelId: s.ai_model_id ?? '',
    status: s.status,
    score: (s.score_iq > 0 || s.score_eq > 0) ? { iq: s.score_iq, eq: s.score_eq, overall: s.score_overall } : undefined,
    createdAt: s.created_at,
  }));
}

/** 管理员获取所有匹配会话 (含用户信息) */
export async function adminReadMatchingSessions(statusFilter?: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return [];

  let query = `/rest/v1/matching_sessions?select=id,user_id,status,result_json,created_at,updated_at&order=created_at.desc`;
  if (statusFilter) {
    query += `&status=eq.${encodeURIComponent(statusFilter)}`;
  }

  const { data: sessions, error } = await fetchJson<Array<{
    id: string; user_id: string; status: string; result_json: unknown;
    created_at: string; updated_at: string;
  }>>(query, { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) });

  if (error || !sessions) return [];

  // 批量获取用户名
  const userIds = [...new Set(sessions.map((s) => s.user_id))];
  const { data: profiles } = await fetchJson<Array<{ id: string; username: string }>>(
    `/rest/v1/profiles?select=id,username&id=in.(${userIds.map((id) => encodeURIComponent(id)).join(',')})`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  const userMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return sessions.map((s) => {
    let topMatch: string | undefined;
    let topScore: number | undefined;
    if (s.result_json) {
      const result = s.result_json as { rankedCandidates?: Array<{ candidate?: { name: string }; compatibility: number }> };
      if (result.rankedCandidates && result.rankedCandidates.length > 0) {
        topMatch = result.rankedCandidates[0].candidate?.name;
        topScore = Math.round(result.rankedCandidates[0].compatibility);
      }
    }
    return {
      id: s.id,
      userId: s.user_id,
      userName: userMap.get(s.user_id) ?? '未知用户',
      status: s.status,
      topMatch,
      topScore,
      createdAt: s.created_at,
    };
  });
}

/** 管理员获取所有题目 (含非激活)。DB 不足 30 题时自动从 mock 数据补充 */
export async function adminReadAllQuestions() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    // 无数据库时直接返回 mock 数据
    const { evaluationQuestions } = await import('./mock-data');
    return evaluationQuestions;
  }

  const { data, error } = await fetchJson<EvaluationQuestionRow[]>(
    `/rest/v1/evaluation_questions?select=id,title,type,dimension,prompt,difficulty,active,sort_order&order=sort_order.asc`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );

  if (error || !data || data.length < 30) {
    // DB 题目不足 30 题时，从 mock 数据补充（以 mock 为准，DB 已有的优先）
    const { evaluationQuestions: mockQuestions } = await import('./mock-data');
    if (!data || data.length === 0) return mockQuestions;

    const dbMap = new Map(data.map((row) => [row.id, mapQuestion(row)]));
    // 合并：mock 题目若 DB 中已有则用 DB 版本
    return mockQuestions.map((mq) => dbMap.get(mq.id) ?? mq);
  }

  return data.map(mapQuestion);
}

/** 管理员获取所有候选 AI (含非激活) */
export async function adminReadAllCandidates() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return [];

  const { data, error } = await fetchJson<AiCandidateRow[]>(
    `/rest/v1/ai_candidates?select=id,name,personality_tags,interest_tags,emotion_tags,capability_score,ai_model_id,description,active&order=capability_score.desc`,
    { method: 'GET', headers: buildHeaders(supabaseServiceRoleKey) }
  );

  if (error || !data) return [];
  return data.map(mapCandidate);
}

/** 管理员删除题目 */
export async function adminDeleteQuestion(questionId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/evaluation_questions?id=eq.${encodeURIComponent(questionId)}`,
    { method: 'DELETE', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  return { error };
}

/** 管理员删除候选 AI */
export async function adminDeleteCandidate(candidateId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/ai_candidates?id=eq.${encodeURIComponent(candidateId)}`,
    { method: 'DELETE', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  return { error };
}

/** 管理员删除评估会话 */
export async function adminDeleteEvaluationSession(sessionId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/evaluation_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  return { error };
}

/** 管理员删除匹配会话 */
export async function adminDeleteMatchingSession(sessionId: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/matching_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', headers: buildHeaders(supabaseServiceRoleKey) }
  );
  return { error };
}

/** 管理员更新评估任务状态 */
export async function adminUpdateEvaluationSession(sessionId: string, status: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/evaluation_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(supabaseServiceRoleKey),
      body: JSON.stringify({ status })
    }
  );
  return { error };
}

/** 管理员更新匹配任务状态 */
export async function adminUpdateMatchingSession(sessionId: string, status: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: '配置缺失' };

  const { error } = await fetchJson<unknown>(
    `/rest/v1/matching_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      headers: buildHeaders(supabaseServiceRoleKey),
      body: JSON.stringify({ status })
    }
  );
  return { error };
}
