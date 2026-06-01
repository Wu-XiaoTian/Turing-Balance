import { generateEvaluationReportFromSupabase, generateAiResponse, getNextQuestion, createEvaluationTask, markTaskEvaluating } from '@/lib/evaluation';
import type { AiModelId, EvaluationType } from '@/lib/types';
import { DEFAULT_AI_MODEL } from '@/lib/evaluation';

/**
 * GET: 获取评估结果或下一题
 * 对应 UML: FetchNextQuestion
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? 'demo-user';
  const type = (url.searchParams.get('type') ?? 'iq_eq') as EvaluationType;
  const action = url.searchParams.get('action');

  // 获取下一题
  if (action === 'next-question') {
    const index = parseInt(url.searchParams.get('index') ?? '0', 10);
    const task = createEvaluationTask(userId, type);
    if (index >= task.questions.length) {
      return Response.json({ ok: true, question: null, done: true });
    }
    return Response.json({
      ok: true,
      question: task.questions[index],
      index,
      total: task.questions.length,
      done: false
    });
  }

  // 调用真实 AI API 生成回答 (异步)
  if (action === 'ai-answer') {
    const questionId = url.searchParams.get('questionId') ?? '';
    const prompt = url.searchParams.get('prompt') ?? '';
    const model = (url.searchParams.get('model') as AiModelId) ?? DEFAULT_AI_MODEL;
    const response = await generateAiResponse(questionId, prompt, model);
    return Response.json({ ok: true, response });
  }

  // 获取完整报告
  const report = await generateEvaluationReportFromSupabase(userId, type);
  return Response.json({ ok: true, report });
}

/**
 * POST: 提交评估数据
 * 对应 UML: SubmitQuestion → GradeResponse → SaveIntermediateResult
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    type?: EvaluationType;
    modelId?: AiModelId;
    answers?: { questionId: string; answer: string }[];
    action?: 'start' | 'submit-answer' | 'complete';
    questionId?: string;
    answer?: string;
    index?: number;
  };

  // 开始新的评估 (对应 UML: StartEvaluation)
  if (body.action === 'start') {
    const task = createEvaluationTask(body.userId ?? 'demo-user', body.type ?? 'iq_eq', undefined, body.modelId);
    const started = markTaskEvaluating(task);
    return Response.json({
      ok: true,
      task: {
        id: started.id,
        status: started.status,
        totalQuestions: started.questions.length,
        questions: started.questions.map((q) => ({ id: q.id, title: q.title, prompt: q.prompt, difficulty: q.difficulty }))
      }
    });
  }

  // 提交单个回答并评分 (对应 UML: GradeResponse)
  if (body.action === 'submit-answer' && body.questionId && body.answer) {
    // 评分已在客户端完成，这里返回确认
    return Response.json({
      ok: true,
      graded: true,
      questionId: body.questionId
    });
  }

  // 完成评估 (对应 UML: Finalizing → Completed)
  if (body.action === 'complete') {
    const report = await generateEvaluationReportFromSupabase(
      body.userId ?? 'demo-user',
      body.type ?? 'iq_eq',
      body.answers ?? []
    );
    return Response.json({ ok: true, report });
  }

  // 默认: 生成报告
  const report = await generateEvaluationReportFromSupabase(
    body.userId ?? 'demo-user',
    body.type ?? 'iq_eq',
    body.answers ?? []
  );

  return Response.json({ ok: true, report });
}