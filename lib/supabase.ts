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

export async function registerSupabaseUser(input: { username: string; email: string; password: string; phoneNumber?: string }) {
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
  if (input.phoneNumber) {
    authBody.phone = input.phoneNumber;
  }

  const authResult = await fetchJson<{ user: SupabaseSessionUser }>(`/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey),
    body: JSON.stringify(authBody)
  });

  if (authResult.error || !authResult.data?.user) {
    return { data: null, error: authResult.error ?? '创建用户失败。' };
  }

  const profileBody: Record<string, unknown> = {
    id: authResult.data.user.id,
    username: input.username,
    email: input.email,
    role: 'user'
  };
  if (input.phoneNumber) {
    profileBody.phone_number = input.phoneNumber;
  }

  const profileInsert = await fetchJson<unknown>(`/rest/v1/profiles`, {
    method: 'POST',
    headers: buildHeaders(supabaseServiceRoleKey),
    body: JSON.stringify(profileBody)
  });

  if (profileInsert.error) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${authResult.data.user.id}`, {
      method: 'DELETE',
      headers: buildHeaders(supabaseServiceRoleKey)
    });

    return { data: null, error: profileInsert.error };
  }

  return {
    data: {
      id: authResult.data.user.id,
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
    return { data: null, error: authResult.error ?? '登录失败。' };
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
    capabilityScore: row.capability_score
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
    `/rest/v1/ai_candidates?select=id,name,personality_tags,interest_tags,emotion_tags,capability_score,active&active=eq.true&order=capability_score.desc`,
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
      active: input.active ?? true
    })
  });

  return { error };
}
