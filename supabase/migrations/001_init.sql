create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text not null unique,
  role text not null default 'user' check (role in ('user', 'evaluator', 'administrator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists public.evaluation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  evaluation_type text not null,
  status text not null default 'uninitialized',
  score_iq integer not null default 0,
  score_eq integer not null default 0,
  score_overall integer not null default 0,
  report_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.evaluation_sessions enable row level security;

drop policy if exists "evaluation_sessions_select_own" on public.evaluation_sessions;
create policy "evaluation_sessions_select_own"
on public.evaluation_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "evaluation_sessions_write_own" on public.evaluation_sessions;
create policy "evaluation_sessions_write_own"
on public.evaluation_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "evaluation_sessions_update_own" on public.evaluation_sessions;
create policy "evaluation_sessions_update_own"
on public.evaluation_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.matching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'idle',
  profile_json jsonb,
  result_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matching_sessions enable row level security;

drop policy if exists "matching_sessions_select_own" on public.matching_sessions;
create policy "matching_sessions_select_own"
on public.matching_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "matching_sessions_write_own" on public.matching_sessions;
create policy "matching_sessions_write_own"
on public.matching_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "matching_sessions_update_own" on public.matching_sessions;
create policy "matching_sessions_update_own"
on public.matching_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists evaluation_sessions_touch_updated_at on public.evaluation_sessions;
create trigger evaluation_sessions_touch_updated_at
before update on public.evaluation_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists matching_sessions_touch_updated_at on public.matching_sessions;
create trigger matching_sessions_touch_updated_at
before update on public.matching_sessions
for each row execute function public.touch_updated_at();

create table if not exists public.evaluation_questions (
  id text primary key,
  title text not null,
  type text not null check (type in ('iq', 'eq', 'iq_eq')),
  dimension text not null check (dimension in ('iq', 'eq', 'hybrid')),
  prompt text not null,
  difficulty integer not null check (difficulty between 1 and 5),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.evaluation_questions enable row level security;

drop policy if exists "evaluation_questions_read_all" on public.evaluation_questions;
create policy "evaluation_questions_read_all"
on public.evaluation_questions
for select
to authenticated
using (true);

create table if not exists public.evaluation_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.evaluation_sessions (id) on delete cascade,
  question_id text not null references public.evaluation_questions (id) on delete cascade,
  answer text not null,
  score_iq integer not null default 0,
  score_eq integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.evaluation_answers enable row level security;

drop policy if exists "evaluation_answers_select_own" on public.evaluation_answers;
create policy "evaluation_answers_select_own"
on public.evaluation_answers
for select
to authenticated
using (
  exists (
    select 1 from public.evaluation_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  )
);

drop policy if exists "evaluation_answers_write_own" on public.evaluation_answers;
create policy "evaluation_answers_write_own"
on public.evaluation_answers
for insert
to authenticated
with check (
  exists (
    select 1 from public.evaluation_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  )
);

create table if not exists public.ai_candidates (
  id text primary key,
  name text not null,
  personality_tags jsonb not null default '[]'::jsonb,
  interest_tags jsonb not null default '[]'::jsonb,
  emotion_tags jsonb not null default '[]'::jsonb,
  capability_score integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_candidates enable row level security;

drop policy if exists "ai_candidates_read_all" on public.ai_candidates;
create policy "ai_candidates_read_all"
on public.ai_candidates
for select
to authenticated
using (true);

drop trigger if exists evaluation_questions_touch_updated_at on public.evaluation_questions;
create trigger evaluation_questions_touch_updated_at
before update on public.evaluation_questions
for each row execute function public.touch_updated_at();

drop trigger if exists ai_candidates_touch_updated_at on public.ai_candidates;
create trigger ai_candidates_touch_updated_at
before update on public.ai_candidates
for each row execute function public.touch_updated_at();

-- ========== 系统参数表 (对应 UML: SystemParameter) ==========
create table if not exists public.system_parameters (
  key text primary key,
  value text not null,
  description text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_parameters enable row level security;

drop policy if exists "system_parameters_read_all" on public.system_parameters;
create policy "system_parameters_read_all"
on public.system_parameters
for select
to authenticated
using (true);

drop policy if exists "system_parameters_write_admin" on public.system_parameters;
create policy "system_parameters_write_admin"
on public.system_parameters
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrator'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrator'
  )
);

drop trigger if exists system_parameters_touch_updated_at on public.system_parameters;
create trigger system_parameters_touch_updated_at
before update on public.system_parameters
for each row execute function public.touch_updated_at();

-- 默认系统参数
insert into public.system_parameters (key, value, description)
values
  ('evaluation_min_questions', '3', '每次评估最小题目数'),
  ('evaluation_max_questions', '10', '每次评估最大题目数'),
  ('evaluation_timeout_ms', '30000', 'AI 回答超时时间(毫秒)'),
  ('matching_interest_weight', '30', '兴趣匹配权重'),
  ('matching_personality_weight', '28', '人格匹配权重'),
  ('matching_emotion_weight', '30', '情绪匹配权重'),
  ('matching_capability_weight', '12', '能力评分权重'),
  ('report_iq_weight', '0.55', '综合评估智商权重'),
  ('report_eq_weight', '0.45', '综合评估情商权重')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

insert into public.evaluation_questions (id, title, type, dimension, prompt, difficulty, active, sort_order)
values
  ('iq-1', '逻辑推理', 'iq', 'iq', '如果所有星体都遵循固定轨道，而某一星体偏离轨道，你会如何解释这一现象？', 3, true, 1),
  ('iq-2', '抽象建模', 'iq', 'iq', '请用一句话描述“复杂系统”与“局部规律”的关系。', 4, true, 2),
  ('eq-1', '共情理解', 'eq', 'eq', '当用户对结果失望时，你会如何回应，才能让对方感到被理解？', 2, true, 3),
  ('eq-2', '情绪调节', 'eq', 'eq', '如果对话对象连续提出矛盾要求，你如何保持耐心并推动沟通？', 3, true, 4),
  ('hy-1', '综合判断', 'iq_eq', 'hybrid', '当技术方案可行但可能伤害用户体验时，你会如何权衡？', 5, true, 5),
  ('hy-2', '综合决策', 'iq_eq', 'hybrid', '请说明一个兼顾效率与情绪照顾的答复策略。', 4, true, 6)
on conflict (id) do update set
  title = excluded.title,
  type = excluded.type,
  dimension = excluded.dimension,
  prompt = excluded.prompt,
  difficulty = excluded.difficulty,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.ai_candidates (id, name, personality_tags, interest_tags, emotion_tags, capability_score, active)
values
  ('ai-01', 'Aurora', '["温柔","细致","稳定"]'::jsonb, '["文学","心理","生活建议"]'::jsonb, '["共情","安抚","陪伴"]'::jsonb, 92, true),
  ('ai-02', 'Vector', '["理性","高效","直接"]'::jsonb, '["算法","工程","数据分析"]'::jsonb, '["冷静","清晰","边界感"]'::jsonb, 88, true),
  ('ai-03', 'Mosaic', '["多元","好奇","灵活"]'::jsonb, '["艺术","创意","故事"]'::jsonb, '["鼓励","包容","陪聊"]'::jsonb, 90, true)
on conflict (id) do update set
  name = excluded.name,
  personality_tags = excluded.personality_tags,
  interest_tags = excluded.interest_tags,
  emotion_tags = excluded.emotion_tags,
  capability_score = excluded.capability_score,
  active = excluded.active,
  updated_at = now();