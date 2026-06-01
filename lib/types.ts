/*
 * ==========================================================================
 * 类型定义 — 对应 UML 类图 (类图UML.txt)
 * ==========================================================================
 * 核心类映射:
 *   User            → AppUser
 *   Administrator   → Administrator
 *   Evaluator       → Evaluator
 *   EvaluationTask  → EvaluationTask / EvaluationReport
 *   EvaluationQuestionnaire → EvaluationQuestion
 *   AIUnderTest     → (external AI model)
 *   CandidateAI     → CandidateAI
 *   SystemParameter → SystemParameter
 *
 * 评估状态机 — 对应 UML 状态图 (AI智商情商状态图UML.txt):
 *   Uninitialized → Initializing → Ready → Evaluating → Finalizing → Completed
 *                                                                  → Cancelled
 *                                                                  → Aborted
 *
 * 匹配状态机 — 对应 UML 状态图 (华清池AI伴侣匹配状态图UML.txt):
 *   Idle → QuestionnairePending → Profiling → CandidateRetrieval
 *        → Matching → DeliveringResult → Completed
 *                                       → Cancelled
 *                                       → Aborted
 *                                       → MatchFailed
 * ==========================================================================
 */

// ========== AI 模型类型 ==========
export type AiModelId =
  | 'deepseek-v4-flash-260425'
  | 'deepseek-v4-pro-260425'
  | 'deepseek-v3-2-251201'
  | 'doubao-seed-2-0-code-preview-260215'
  | 'doubao-seed-1-8-251228'
  | 'doubao-seed-2-0-lite-260428'
  | 'glm-4-7-251222';

// ========== 评估类型 ==========
export type EvaluationType = 'iq' | 'eq' | 'iq_eq';

// ========== 评估任务状态 (对应 UML 状态图) ==========
export type TaskStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'evaluating'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'aborted';

// ========== 匹配任务状态 (对应 UML 状态图) ==========
export type MatchingStatus =
  | 'idle'
  | 'questionnaire_pending'
  | 'profiling'
  | 'candidate_retrieval'
  | 'matching'
  | 'delivering_result'
  | 'completed'
  | 'cancelled'
  | 'aborted'
  | 'match_failed';

// ========== 角色类型 ==========
export type UserRole = 'user' | 'evaluator' | 'administrator';

// ========== 用户相关 (对应 UML: User, Administrator, Evaluator) ==========
export interface AppUser {
  id: string;
  username: string;
  phoneNumber?: string;
  email?: string;
  role: UserRole;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface Administrator extends AppUser {
  adminLevel: number;
  role: 'administrator';
}

export interface Evaluator extends AppUser {
  evaluatorID: string;
  role: 'evaluator';
}

// ========== 系统参数 (对应 UML: SystemParameter) ==========
export interface SystemParameter {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
  description?: string;
  updatedBy?: string;
  updatedAt?: string;
}

// ========== 评估模块 (对应 UML: EvaluationQuestionnaire, AIUnderTest, EvaluationTask) ==========
export interface EvaluationQuestion {
  id: string;
  title: string;
  type: EvaluationType;
  dimension: 'iq' | 'eq' | 'hybrid';
  prompt: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface EvaluationAnswer {
  questionId: string;
  answer: string;
  scoreIq?: number;
  scoreEq?: number;
}

export interface EvaluationScore {
  iq: number;
  eq: number;
  overall: number;
  details?: { questionId: string; iq: number; eq: number }[];
}

export interface EvaluationTask {
  id: string;
  userId: string;
  evaluationType: EvaluationType;
  modelId?: AiModelId;
  status: TaskStatus;
  sessionId?: string;
  currentQuestionIndex: number;
  questions: EvaluationQuestion[];
  answers: EvaluationAnswer[];
  score?: EvaluationScore;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvaluationReport {
  sessionId?: string;
  userId: string;
  evaluationType: EvaluationType;
  status: TaskStatus;
  selectedQuestions: EvaluationQuestion[];
  answers: EvaluationAnswer[];
  score: EvaluationScore;
  conclusion: string;
  createdAt?: string;
}

// ========== AI 候选 (对应 UML: CandidateAI) ==========
export interface CandidateAI {
  id: string;
  name: string;
  personalityTags: string[];
  interestTags: string[];
  emotionTags: string[];
  capabilityScore: number;
  description?: string;
}

// ========== 匹配模块 (对应 UML: MatchPreference, MatchResult) ==========
export interface MatchPreference {
  interests: string[];
  personality: string[];
  needs: string[];
}

export interface CandidateMatchResult {
  candidate: CandidateAI;
  compatibility: number;
  interestScore: number;
  personalityScore: number;
  emotionScore: number;
  capabilityScore: number;
  reasons: string[];
}

export interface MatchingTask {
  id: string;
  userId: string;
  status: MatchingStatus;
  questionnaireAnswers: Record<string, string>;
  profile?: MatchPreference;
  candidates?: CandidateAI[];
  rankedCandidates?: CandidateMatchResult[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MatchingReport {
  sessionId?: string;
  userId: string;
  status: MatchingStatus;
  profile: MatchPreference;
  rankedCandidates: CandidateMatchResult[];
  summary: string;
  createdAt?: string;
}

// ========== 评估循环中间状态 (对应 UML 顺序图) ==========
export interface EvaluationLoopState {
  taskId: string;
  status: TaskStatus;
  currentQuestion: EvaluationQuestion | null;
  questionIndex: number;
  totalQuestions: number;
  aiResponse: string | null;
  intermediateScore: { iq: number; eq: number } | null;
  error: string | null;
  timeoutMs: number;
  startTime: string | null;
}

// ========== 问卷问题类型 (用于匹配问卷) ==========
export interface QuestionnaireQuestion {
  id: string;
  type: 'interests' | 'personality' | 'needs' | 'open';
  question: string;
  options?: string[];
  multiple?: boolean;
}