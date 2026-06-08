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
  ai_model_id text,                              -- 关联火山引擎 AI 模型 ID
  description text,                               -- 候选描述
  evaluation_count integer not null default 0,    -- 累计评估次数 (用于平均值计算)
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

-- ========== 默认 AI 候选数据 (火山引擎 AI 模型作为伴侣) ==========
insert into public.ai_candidates (id, name, personality_tags, interest_tags, emotion_tags, capability_score, ai_model_id, description, active)
values
  ('ai-deepseek-v4-pro', 'DeepSeek V4 Pro · 思渊', '["理性","深度","缜密","逻辑","严谨"]'::jsonb, '["算法","工程","数据分析","科技","推理","数学"]'::jsonb, '["冷静","清晰","边界感","分析","耐心"]'::jsonb, 85, 'deepseek-v4-pro-260425', '深度推理专家，擅长复杂逻辑分析和抽象建模。', true),
  ('ai-deepseek-v4-flash', 'DeepSeek V4 Flash · 流光', '["高效","敏捷","直接","务实"]'::jsonb, '["科技","工程","数据分析","效率","策略"]'::jsonb, '["清晰","简洁","高效","支持"]'::jsonb, 78, 'deepseek-v4-flash-260425', '快速响应专家，效率优先。', true),
  ('ai-deepseek-v3', 'DeepSeek V3.2 · 均衡', '["均衡","稳重","可靠","全面"]'::jsonb, '["算法","文学","心理","工程","故事"]'::jsonb, '["稳定","共情","耐心","倾听"]'::jsonb, 80, 'deepseek-v3-2-251201', '经典均衡模型，理性与感性平衡。', true),
  ('ai-doubao-seed-code', '豆包 Seed 2.0 Code · 智码', '["理性","精准","逻辑","严谨","高效"]'::jsonb, '["算法","编程","工程","数据分析","逻辑","科技"]'::jsonb, '["冷静","清晰","分析","边界感"]'::jsonb, 82, 'doubao-seed-2-0-code-preview-260215', '代码与逻辑推理优化。', true),
  ('ai-doubao-seed-1-8', '豆包 Seed 1.8 · 稳石', '["稳定","可靠","温和","包容"]'::jsonb, '["生活建议","心理","文学","故事","沟通"]'::jsonb, '["共情","安抚","陪伴","鼓励","倾听"]'::jsonb, 76, 'doubao-seed-1-8-251228', '稳定可靠，适合日常陪伴。', true),
  ('ai-doubao-seed-lite', '豆包 Seed 2.0 Lite · 轻语', '["活泼","开朗","灵活","轻快"]'::jsonb, '["创意","故事","艺术","陪聊","娱乐"]'::jsonb, '["鼓励","幽默","陪伴","陪聊","温暖"]'::jsonb, 72, 'doubao-seed-2-0-lite-260428', '轻量高效，轻松愉快。', true),
  ('ai-glm-4', 'GLM-4 7B · 知源', '["多元","好奇","灵活","探索"]'::jsonb, '["文学","科技","心理","艺术","创意"]'::jsonb, '["理解","鼓励","包容","沟通"]'::jsonb, 70, 'glm-4-7-251222', '知识面广，多元化话题探索。', true)
on conflict (id) do update set
  name = excluded.name,
  personality_tags = excluded.personality_tags,
  interest_tags = excluded.interest_tags,
  emotion_tags = excluded.emotion_tags,
  capability_score = excluded.capability_score,
  ai_model_id = excluded.ai_model_id,
  description = excluded.description,
  active = excluded.active,
  updated_at = now();
