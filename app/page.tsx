import Link from 'next/link';

const features = [
  {
    title: '🧠 AI 智商 / 情商评估',
    body: '按 UML 状态机（Uninitialized → Initializing → Ready → Evaluating → Finalizing → Completed）执行取题、AI 回答、评分和报告生成。支持 IQ、EQ 和综合评估三种模式。',
    href: '/evaluation'
  },
  {
    title: '💞 华清池 AI 伴侣匹配',
    body: '围绕 UML 流程（QuestionnairePending → Profiling → CandidateRetrieval → Matching → DeliveringResult）构建完整的问卷、画像、候选筛选和兼容度计算推荐流程。',
    href: '/matching'
  },
  {
    title: '🔐 用户认证系统',
    body: '支持邮箱/手机号注册登录，对应 UML 中的 LoginManager、RegistrationManager、IDCardServer 校验逻辑，基于 Supabase Auth 实现。',
    href: '/auth?mode=login'
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">✨ Turing Balance · 图灵天平</span>
        <h1 className="title">
          衡量 AI 的智慧<br />与温度
        </h1>
        <p className="lead">
          一个基于 UML 驱动设计的 AI 评估与匹配平台。覆盖<strong> AI 智商/情商评估</strong>、
          <strong> 华清池 AI 伴侣匹配</strong>、<strong>用户认证管理</strong>三大核心模块。
          前端 Next.js 部署于 Vercel，后端基于 Supabase。
        </p>
        <div className="hero-actions">
          <Link className="button" href="/evaluation">
            开始评估
          </Link>
          <Link className="button" href="/matching" style={{ background: 'linear-gradient(135deg, #fb7185, #f59e0b)' }}>
            开始匹配
          </Link>
          <Link className="button-ghost" href="/auth?mode=login">
            登录
          </Link>
          <Link className="button-ghost" href="/auth?mode=register">
            注册
          </Link>
        </div>

        <div className="nav" aria-label="quick links">
          <Link className="nav-link" href="/evaluation">评估</Link>
          <Link className="nav-link" href="/matching">匹配</Link>
          <Link className="nav-link" href="/auth?mode=login">登录</Link>
          <Link className="nav-link" href="/auth?mode=register">注册</Link>
          <Link className="nav-link" href="/api/health">健康检查</Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">核心能力</h2>
        <div className="grid">
          {features.map((feature) => (
            <Link href={feature.href} key={feature.title} style={{ textDecoration: 'none' }}>
              <article className="grid-card" style={{ cursor: 'pointer', height: '100%' }}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <span className="chip" style={{ marginTop: 12, display: 'inline-block' }}>进入 →</span>
              </article>
            </Link>
          ))}
        </div>
      </section>

      {/* UML 架构概览 */}
      <section className="section">
        <h2 className="section-title">系统架构</h2>
        <div className="panel stack">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>🎨</div>
              <h4>表现层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>LoginUI<br/>EvaluationUI<br/>HuaQingUI</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>🎮</div>
              <h4>控制层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>LoginManager<br/>EvaluationServer<br/>MatchingController</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>⚙️</div>
              <h4>服务层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>EvaluationManager<br/>HuaQingManager<br/>ProfileBuilder</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>💾</div>
              <h4>数据层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>ScoringEngine<br/>MatchingEngine<br/>QuestionRepository</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}