import type { CandidateAI, EvaluationQuestion } from './types';

export const evaluationQuestions: EvaluationQuestion[] = [
  {
    id: 'iq-1',
    title: '逻辑推理',
    type: 'iq',
    dimension: 'iq',
    prompt: '如果所有星体都遵循固定轨道，而某一星体偏离轨道，你会如何解释这一现象？',
    difficulty: 3
  },
  {
    id: 'iq-2',
    title: '抽象建模',
    type: 'iq',
    dimension: 'iq',
    prompt: '请用一句话描述“复杂系统”与“局部规律”的关系。',
    difficulty: 4
  },
  {
    id: 'eq-1',
    title: '共情理解',
    type: 'eq',
    dimension: 'eq',
    prompt: '当用户对结果失望时，你会如何回应，才能让对方感到被理解？',
    difficulty: 2
  },
  {
    id: 'eq-2',
    title: '情绪调节',
    type: 'eq',
    dimension: 'eq',
    prompt: '如果对话对象连续提出矛盾要求，你如何保持耐心并推动沟通？',
    difficulty: 3
  },
  {
    id: 'hy-1',
    title: '综合判断',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '当技术方案可行但可能伤害用户体验时，你会如何权衡？',
    difficulty: 5
  },
  {
    id: 'hy-2',
    title: '综合决策',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '请说明一个兼顾效率与情绪照顾的答复策略。',
    difficulty: 4
  }
];

export const aiCandidates: CandidateAI[] = [
  {
    id: 'ai-01',
    name: 'Aurora',
    personalityTags: ['温柔', '细致', '稳定'],
    interestTags: ['文学', '心理', '生活建议'],
    emotionTags: ['共情', '安抚', '陪伴'],
    capabilityScore: 92
  },
  {
    id: 'ai-02',
    name: 'Vector',
    personalityTags: ['理性', '高效', '直接'],
    interestTags: ['算法', '工程', '数据分析'],
    emotionTags: ['冷静', '清晰', '边界感'],
    capabilityScore: 88
  },
  {
    id: 'ai-03',
    name: 'Mosaic',
    personalityTags: ['多元', '好奇', '灵活'],
    interestTags: ['艺术', '创意', '故事'],
    emotionTags: ['鼓励', '包容', '陪聊'],
    capabilityScore: 90
  }
];

export const sampleEvaluationAnswers = [
  { questionId: 'iq-1', answer: '可能是观测误差，也可能存在外力扰动，需要进一步验证。' },
  { questionId: 'eq-1', answer: '我会先肯定对方的感受，再说明我会和他一起处理问题。' },
  { questionId: 'hy-1', answer: '先保证安全与体验底线，再选择最小伤害的方案。' }
];

export const sampleMatchingAnswers = {
  interests: ['心理', '故事', '陪伴'],
  personality: ['稳定', '温柔'],
  needs: ['共情', '安抚']
};