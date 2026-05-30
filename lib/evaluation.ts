import { evaluationQuestions, sampleEvaluationAnswers } from './mock-data';
import {
  readEvaluationQuestions,
  readOrFallbackUserProfile,
  writeEvaluationAnswers,
  writeEvaluationSession
} from './supabase';
import type {
  EvaluationAnswer,
  EvaluationQuestion,
  EvaluationReport,
  EvaluationScore,
  EvaluationType
} from './types';

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function pickQuestions(type: EvaluationType, count = 3): EvaluationQuestion[] {
  const pool = evaluationQuestions.filter((question) => type === 'iq_eq' || question.type === type);
  return pool.slice(0, count);
}

function scoreAnswer(question: EvaluationQuestion, answer: string) {
  const normalized = normalize(answer);
  const lengthScore = Math.min(normalized.length / 18, 5);
  const logicHits = ['因此', '所以', '验证', '推理', '分析', '解释'].filter((word) => normalized.includes(word)).length;
  const empathyHits = ['理解', '感受', '共情', '安抚', '支持', '耐心'].filter((word) => normalized.includes(word)).length;

  const iqBase = question.dimension !== 'eq' ? lengthScore + logicHits * 1.5 : lengthScore * 0.7;
  const eqBase = question.dimension !== 'iq' ? lengthScore + empathyHits * 1.5 : lengthScore * 0.6;

  return {
    iq: Math.min(100, Math.round(iqBase * 10)),
    eq: Math.min(100, Math.round(eqBase * 10))
  };
}

function buildReport(
  userId: string,
  evaluationType: EvaluationType,
  selectedQuestions: EvaluationQuestion[],
  answers: EvaluationAnswer[]
): EvaluationReport {
  const score = aggregateEvaluation(selectedQuestions, answers);

  return {
    userId,
    evaluationType,
    status: 'completed',
    selectedQuestions,
    answers,
    score,
    conclusion:
      score.overall >= 80
        ? '该 AI 在逻辑推理与情绪回应上表现均衡，适合复杂交互场景。'
        : score.overall >= 60
          ? '该 AI 具有可用的综合能力，但在深层情绪理解或复杂推理中仍有提升空间。'
          : '该 AI 需要进一步优化回答质量、稳定性与情绪表达。'
  };
}

export function aggregateEvaluation(questions: EvaluationQuestion[], answers: EvaluationAnswer[]): EvaluationScore {
  if (questions.length === 0) {
    return { iq: 0, eq: 0, overall: 0 };
  }

  const scored = questions.map((question) => {
    const answer = answers.find((item) => item.questionId === question.id)?.answer ?? '';
    return scoreAnswer(question, answer);
  });

  const iq = Math.round(scored.reduce((sum, item) => sum + item.iq, 0) / scored.length);
  const eq = Math.round(scored.reduce((sum, item) => sum + item.eq, 0) / scored.length);
  const overall = Math.round(iq * 0.55 + eq * 0.45);

  return { iq, eq, overall };
}

export function generateEvaluationReport(
  userId: string,
  evaluationType: EvaluationType,
  answers = sampleEvaluationAnswers
): EvaluationReport {
  const selectedQuestions = pickQuestions(evaluationType);
  return buildReport(userId, evaluationType, selectedQuestions, answers);
}

export async function generateEvaluationReportFromSupabase(
  userId: string,
  evaluationType: EvaluationType,
  answers = sampleEvaluationAnswers,
  options: { allowFallback?: boolean } = {}
) {
  const allowFallback = options.allowFallback ?? true;
  const profile = await readOrFallbackUserProfile(userId);
  const databaseQuestions = await readEvaluationQuestions(evaluationType);
  const selectedQuestions = databaseQuestions.length > 0 ? databaseQuestions.slice(0, 3) : pickQuestions(evaluationType);

  if (!profile && !allowFallback) {
    return null;
  }

  const report = buildReport(userId, evaluationType, selectedQuestions, answers);

  if (!profile) {
    return report;
  }

  const session = await writeEvaluationSession({
    userId,
    evaluationType,
    status: 'completed',
    scoreIq: report.score.iq,
    scoreEq: report.score.eq,
    scoreOverall: report.score.overall,
    reportJson: report
  });

  if (session) {
    await writeEvaluationAnswers({
      sessionId: session.id,
      answers: selectedQuestions.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id)?.answer ?? '';
        const scored = scoreAnswer(question, answer);

        return {
          session_id: session.id,
          question_id: question.id,
          answer,
          score_iq: scored.iq,
          score_eq: scored.eq
        };
      })
    });

    return {
      ...report,
      sessionId: session.id
    };
  }

  return report;
}
