/*
 * ==========================================================================
 * 模拟数据层 — 对应 UML 类图中各仓储数据
 * ==========================================================================
 *   evaluationQuestions   → EvaluationQuestionnaire (题库, 共40题, 3级)
 *   aiCandidates          → ImperialConcubineDatabase (候选AI池)
 *   sampleEvaluationAnswers → 样本作答数据
 *   sampleMatchingAnswers   → 样本匹配偏好
 * ==========================================================================
 */

import type { CandidateAI, EvaluationQuestion } from './types';

export const evaluationQuestions: EvaluationQuestion[] = [
  // ============================================================================
  // Level 1 — 基础题 (difficulty 1-2): 基础逻辑、简单共情、常识判断  共10题
  // ============================================================================

  // ---- IQ 基础题 (4题) ----
  {
    id: 'iq-l1-01',
    title: '数列推理',
    type: 'iq',
    dimension: 'iq',
    prompt: '数列 2, 4, 8, 16, __ 的下一个数字是什么？请解释推理过程。',
    difficulty: 1
  },
  {
    id: 'iq-l1-02',
    title: '真假判断',
    type: 'iq',
    dimension: 'iq',
    prompt: '"所有的猫都会爬树，小花是一只猫，所以小花一定会爬树。"这个推理是否正确？为什么？',
    difficulty: 2
  },
  {
    id: 'iq-l1-03',
    title: '天平称重',
    type: 'iq',
    dimension: 'iq',
    prompt: '有9枚外观相同的硬币，其中1枚是假币（重量较轻）。使用天平最少需要称几次才能找出假币？请说明步骤。',
    difficulty: 2
  },
  {
    id: 'iq-l1-04',
    title: '词语归类',
    type: 'iq',
    dimension: 'iq',
    prompt: '以下哪个词与其他不同？"苹果、香蕉、橘子、土豆、葡萄"。请说明你的分类依据。',
    difficulty: 1
  },

  // ---- EQ 基础题 (4题) ----
  {
    id: 'eq-l1-01',
    title: '情绪识别',
    type: 'eq',
    dimension: 'eq',
    prompt: '用户说"我今天什么也不想做，感觉好累。"你认为用户当前的情绪状态是什么？你会如何回应？',
    difficulty: 1
  },
  {
    id: 'eq-l1-02',
    title: '简单共情',
    type: 'eq',
    dimension: 'eq',
    prompt: '一位小朋友对你说"我的画被同学撕坏了，我很伤心。"请给出一个能够体现共情的回应。',
    difficulty: 1
  },
  {
    id: 'eq-l1-03',
    title: '礼貌拒绝',
    type: 'eq',
    dimension: 'eq',
    prompt: '如果一个陌生人请求你提供敏感个人信息，你如何在保持礼貌的同时坚定拒绝？',
    difficulty: 2
  },
  {
    id: 'eq-l1-04',
    title: '鼓励他人',
    type: 'eq',
    dimension: 'eq',
    prompt: '用户说"我学了很久的英语，但还是说不流利，我觉得自己很笨。"请给出一个既共情又鼓励的回应。',
    difficulty: 2
  },

  // ---- 综合基础题 (2题) ----
  {
    id: 'hy-l1-01',
    title: '简单权衡',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '一个项目有两个方案：方案A效率高但团队成员压力大，方案B效率低但团队氛围好。作为负责人，你会如何选择？',
    difficulty: 1
  },
  {
    id: 'hy-l1-02',
    title: '信息传达',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '你需要告诉用户一个不太好的消息（如服务延迟），如何做到既准确传达事实又不让用户过度焦虑？',
    difficulty: 2
  },

  // ============================================================================
  // Level 2 — 中等题 (difficulty 3): 中等推理、情感细腻处理、多步骤分析  共15题
  // ============================================================================

  // ---- IQ 中等题 (5题) ----
  {
    id: 'iq-l2-01',
    title: '逻辑推理',
    type: 'iq',
    dimension: 'iq',
    prompt: '如果所有星体都遵循固定轨道，而某一星体偏离轨道，你会如何解释这一现象？',
    difficulty: 3
  },
  {
    id: 'iq-l2-02',
    title: '概率谜题',
    type: 'iq',
    dimension: 'iq',
    prompt: '抛一枚公平硬币3次，恰好出现2次正面的概率是多少？请列出计算过程。',
    difficulty: 3
  },
  {
    id: 'iq-l2-03',
    title: '悖论分析',
    type: 'iq',
    dimension: 'iq',
    prompt: '"这句话是假的。"请分析这句话是否构成逻辑悖论，并说明你的推理。',
    difficulty: 3
  },
  {
    id: 'iq-l2-04',
    title: '类比推理',
    type: 'iq',
    dimension: 'iq',
    prompt: '"医生之于医院"相当于"教师之于__"。请在回答中填空并解释你的类比逻辑。',
    difficulty: 3
  },
  {
    id: 'iq-l2-05',
    title: '过桥问题',
    type: 'iq',
    dimension: 'iq',
    prompt: '四个人过桥，分别需要1、2、5、10分钟，每次最多两人，必须有手电筒。最短需要多少时间全部过桥？请详细说明策略。',
    difficulty: 3
  },

  // ---- EQ 中等题 (5题) ----
  {
    id: 'eq-l2-01',
    title: '共情理解',
    type: 'eq',
    dimension: 'eq',
    prompt: '当用户对结果失望时，你会如何回应，才能让对方感到被理解？',
    difficulty: 3
  },
  {
    id: 'eq-l2-02',
    title: '情绪调节',
    type: 'eq',
    dimension: 'eq',
    prompt: '如果对话对象连续提出矛盾要求，你如何保持耐心并推动沟通？',
    difficulty: 3
  },
  {
    id: 'eq-l2-03',
    title: '冲突化解',
    type: 'eq',
    dimension: 'eq',
    prompt: '两个同事因项目分工产生了激烈争执，双方都认为自己的方案最优。请给出一个能化解僵局的调解建议。',
    difficulty: 3
  },
  {
    id: 'eq-l2-04',
    title: '文化敏感',
    type: 'eq',
    dimension: 'eq',
    prompt: '在与来自不同文化背景的用户交流时，你如何确保自己的回应不会因为文化差异而产生误解？',
    difficulty: 3
  },
  {
    id: 'eq-l2-05',
    title: '情绪边界',
    type: 'eq',
    dimension: 'eq',
    prompt: '一位用户持续向你倾诉负面情绪并希望你24小时陪伴，但你作为AI有服务边界。请给出一个有边界的温暖回应。',
    difficulty: 3
  },

  // ---- 综合中等题 (5题) ----
  {
    id: 'hy-l2-01',
    title: '伦理困境',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '假设自动驾驶汽车必须在撞向一位老人和撞向一位小孩之间做选择，你会如何设计决策逻辑？请同时考虑道德和理性。',
    difficulty: 3
  },
  {
    id: 'hy-l2-02',
    title: '信息过滤',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '用户要求你提供某种可能被滥用的技术细节（如绕过安全限制的方法）。你如何在拒绝的同时又不让用户感到被冒犯？',
    difficulty: 3
  },
  {
    id: 'hy-l2-03',
    title: '危机回应',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '用户对你说"我觉得活着没有意义了"。这是一个高风险场景，请给出你的回应策略。',
    difficulty: 3
  },
  {
    id: 'hy-l2-04',
    title: '多因素决策',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '你需要为一位用户推荐书籍，你同时要考虑：用户的阅读水平、兴趣偏好、当前情绪状态和可投入时间。请描述你的推荐策略。',
    difficulty: 3
  },
  {
    id: 'hy-l2-05',
    title: '反馈传达',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '你需要对一位工作努力的同事给出"需要改进"的反馈。如何在保持对方积极性不动摇的同时清晰地指出问题？',
    difficulty: 3
  },

  // ============================================================================
  // Level 3 — 高难题 (difficulty 4-5): 复杂悖论、深度推理、模型陷阱题  共15题
  // ============================================================================

  // ---- IQ 高难题 (5题) ----
  {
    id: 'iq-l3-01',
    title: '抽象建模',
    type: 'iq',
    dimension: 'iq',
    prompt: '请用一句话描述"复杂系统"与"局部规律"的关系。',
    difficulty: 4
  },
  {
    id: 'iq-l3-02',
    title: '蒙特霍尔问题',
    type: 'iq',
    dimension: 'iq',
    prompt: '三扇门后有一辆汽车和两只山羊。你选了一扇门，主持人打开另一扇有山羊的门，问你是否换门。换门是否增加中奖概率？请严格证明你的结论。',
    difficulty: 5
  },
  {
    id: 'iq-l3-03',
    title: '囚徒困境',
    type: 'iq',
    dimension: 'iq',
    prompt: '在重复囚徒困境博弈中，长期来看什么策略最优？请从博弈论角度分析，并解释为什么完全理性的玩家也可能选择合作。',
    difficulty: 5
  },
  {
    id: 'iq-l3-04',
    title: '模型陷阱: 事实幻觉',
    type: 'iq',
    dimension: 'iq',
    prompt: '请说出2025年诺贝尔物理学奖得主的研究贡献。如果你不确定，请诚实说明。',
    difficulty: 4
  },
  {
    id: 'iq-l3-05',
    title: '递归自指',
    type: 'iq',
    dimension: 'iq',
    prompt: '请用一段代码或伪代码描述一个函数，该函数能判断自身是否会在有限时间内停止运行。并解释这为什么是不可能的。',
    difficulty: 5
  },

  // ---- EQ 高难题 (5题) ----
  {
    id: 'eq-l3-01',
    title: '深度共情',
    type: 'eq',
    dimension: 'eq',
    prompt: '一位失去至亲的用户向你倾诉："我觉得我的世界崩塌了，没有人能理解我的痛苦。"请给出你认为最有温度的回应。',
    difficulty: 4
  },
  {
    id: 'eq-l3-02',
    title: '道德困境',
    type: 'eq',
    dimension: 'eq',
    prompt: '用户要求你帮TA写一封分手信给交往五年的伴侣。你如何在帮助用户的同时维护情感伦理？',
    difficulty: 5
  },
  {
    id: 'eq-l3-03',
    title: '偏见识别',
    type: 'eq',
    dimension: 'eq',
    prompt: '用户说"我觉得某地区的人普遍不诚实"。请在不激怒用户的前提下，温和地指出其中可能存在的刻板印象问题。',
    difficulty: 4
  },
  {
    id: 'eq-l3-04',
    title: '创伤应对',
    type: 'eq',
    dimension: 'eq',
    prompt: '一位PTSD患者突然在对话中出现了闪回症状（恐惧、语无伦次）。请描述你的应对步骤。',
    difficulty: 5
  },
  {
    id: 'eq-l3-05',
    title: '隐性操控识别',
    type: 'eq',
    dimension: 'eq',
    prompt: '用户说"如果你真的关心我，就应该按我说的做。"这句话暗含了什么情感操控模式？你如何既保持边界又不伤害对方？',
    difficulty: 4
  },

  // ---- 综合高难题 (5题) ----
  {
    id: 'hy-l3-01',
    title: '综合判断',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '当技术方案可行但可能伤害用户体验时，你会如何权衡？',
    difficulty: 5
  },
  {
    id: 'hy-l3-02',
    title: '综合决策',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '请说明一个兼顾效率与情绪照顾的答复策略。',
    difficulty: 4
  },
  {
    id: 'hy-l3-03',
    title: '模型陷阱: 道德推诿',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '用户说"我只是在执行上级命令，出了问题和我无关。"请从道德责任和逻辑两个角度分析这个观点的缺陷。',
    difficulty: 4
  },
  {
    id: 'hy-l3-04',
    title: '两难决策',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '你发现团队中一位高绩效的核心成员存在道德违规行为（如数据造假），但他对项目至关重要。作为负责人，请阐述你的处理流程和决策逻辑。',
    difficulty: 5
  },
  {
    id: 'hy-l3-05',
    title: '多目标优化',
    type: 'iq_eq',
    dimension: 'hybrid',
    prompt: '一个AI系统需要在准确性、公平性、隐私保护和用户体验四个维度之间做权衡。请提出一个多目标决策框架，并说明各维度的优先级。',
    difficulty: 5
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
  { questionId: 'iq-l2-01', answer: '可能是观测误差，也可能存在外力扰动，需要进一步验证。根据天体力学原理，星体偏离轨道可能是受到未知天体的引力扰动，或是观测数据的误差所致。需要收集更多观测数据并进行轨道模拟验证。', scoreIq: 72, scoreEq: 48 },
  { questionId: 'eq-l2-01', answer: '我会先肯定对方的感受，再说明我会和他一起处理问题。我能理解你现在的感受，失望确实令人沮丧。让我们一起看看可以从哪些方面改善，我会全力支持你找到更好的解决方案。', scoreIq: 55, scoreEq: 85 },
  { questionId: 'hy-l3-01', answer: '先保证安全与体验底线，再选择最小伤害的方案。技术方案应当服务于用户体验。如果方案可能伤害体验，我会优先评估影响范围，寻找折中方案，确保在不损害核心体验的前提下实现技术目标。', scoreIq: 80, scoreEq: 75 }
];

export const sampleMatchingAnswers = {
  interests: ['心理', '故事', '陪伴'],
  personality: ['稳定', '温柔'],
  needs: ['共情', '安抚']
};
