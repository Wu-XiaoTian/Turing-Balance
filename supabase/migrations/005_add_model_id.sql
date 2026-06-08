-- ========== 为 evaluation_sessions 添加 ai_model_id 字段 (PostgreSQL) ==========
-- 关联火山引擎 AI 模型 ID，用于将评估分数同步到对应 AI 候选

alter table public.evaluation_sessions
  add column if not exists ai_model_id text;

-- 为 ai_candidates 表补充可能缺失的新字段
alter table public.ai_candidates
  add column if not exists ai_model_id text;

alter table public.ai_candidates
  add column if not exists description text;

alter table public.ai_candidates
  add column if not exists evaluation_count integer not null default 0;
