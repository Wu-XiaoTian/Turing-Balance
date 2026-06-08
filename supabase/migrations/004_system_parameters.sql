-- ========== 系统参数表 ==========
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

-- ========== 默认系统参数 ==========
insert into public.system_parameters (key, value, description)
values
  ('evaluation_min_questions', '3', '每次评估最小题目数'),
  ('evaluation_max_questions', '10', '每次评估最大题目数'),
  ('evaluation_timeout_ms', '30000', 'AI 回答超时时间(毫秒)'),
  ('matching_interest_weight', '25', '兴趣匹配权重'),
  ('matching_personality_weight', '25', '人格匹配权重'),
  ('matching_emotion_weight', '25', '情绪匹配权重'),
  ('matching_capability_weight', '25', '能力评分权重'),
  ('report_iq_weight', '0.55', '综合评估智商权重'),
  ('report_eq_weight', '0.45', '综合评估情商权重')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();
