-- ========== 评估会话表 ==========
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

-- ========== 评估题库表 ==========
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

-- ========== 评估答案表 ==========
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

-- ========== 触发器 ==========
drop trigger if exists evaluation_sessions_touch_updated_at on public.evaluation_sessions;
create trigger evaluation_sessions_touch_updated_at
before update on public.evaluation_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists evaluation_questions_touch_updated_at on public.evaluation_questions;
create trigger evaluation_questions_touch_updated_at
before update on public.evaluation_questions
for each row execute function public.touch_updated_at();

-- ========== 默认题库数据 ==========
insert into public.evaluation_questions (id, title, type, dimension, prompt, difficulty, active, sort_order)
values
  ('iq-1', '逻辑推理', 'iq', 'iq', '如果所有星体都遵循固定轨道，而某一星体偏离轨道，你会如何解释这一现象？', 3, true, 1),
  ('iq-2', '抽象建模', 'iq', 'iq', '请用一句话描述"复杂系统"与"局部规律"的关系。', 4, true, 2),
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
