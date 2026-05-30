export type EvaluationType = 'iq' | 'eq' | 'iq_eq';

export type TaskStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'evaluating'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'aborted';

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

export interface AppUser {
  id: string;
  username: string;
  phoneNumber?: string;
  role: 'user' | 'evaluator' | 'administrator';
}

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
}

export interface EvaluationScore {
  iq: number;
  eq: number;
  overall: number;
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
}

export interface CandidateAI {
  id: string;
  name: string;
  personalityTags: string[];
  interestTags: string[];
  emotionTags: string[];
  capabilityScore: number;
}

export interface MatchPreference {
  interests: string[];
  personality: string[];
  needs: string[];
}

export interface CandidateMatchResult {
  candidate: CandidateAI;
  compatibility: number;
  reasons: string[];
}

export interface MatchingReport {
  sessionId?: string;
  userId: string;
  status: MatchingStatus;
  profile: MatchPreference;
  rankedCandidates: CandidateMatchResult[];
  summary: string;
}