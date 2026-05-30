-- ========== 匹配会话表 ==========
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

-- ========== AI 候选池表 ==========
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

-- ========== 触发器 ==========
drop trigger if exists matching_sessions_touch_updated_at on public.matching_sessions;
create trigger matching_sessions_touch_updated_at
before update on public.matching_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists ai_candidates_touch_updated_at on public.ai_candidates;
create trigger ai_candidates_touch_updated_at
before update on public.ai_candidates
for each row execute function public.touch_updated_at();

-- ========== 默认 AI 候选数据 ==========
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
