import Link from 'next/link';

const features = [
  {
    title: 'AI 智商 / 情商评估',
    body: '按 UML 中的评估状态机执行取题、回答、评分和报告生成。'
  },
  {
    title: '华清池 AI 伴侣匹配',
    body: '围绕问卷、画像、候选筛选、兼容度计算构建推荐流程。'
  },
  {
    title: 'Supabase 后端',
    body: '用 Auth、数据库和 Edge Functions 承载认证、存储和业务编排。'
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Turing Balance · 图灵天平</span>
        <h1 className="title">测试不同 AI 的智商和情商</h1>
        <p className="lead">
          这是一个依据 UML 设计的完整软件骨架，覆盖用户登录注册、AI 智商/情商评估、华清池 AI 伴侣匹配、评分汇总和结果报告。
          前端面向 Vercel，后端面向 Supabase。
        </p>
        <div className="hero-actions">
          <Link className="button" href="/evaluation">
            查看评估流程
          </Link>
          <Link className="button-ghost" href="/matching">
            查看匹配流程
          </Link>
        </div>

        <div className="nav" aria-label="quick links">
          <Link className="nav-link" href="/login">
            登录
          </Link>
          <Link className="nav-link" href="/register">
            注册
          </Link>
          <Link className="nav-link" href="/api/health">
            健康检查
          </Link>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">核心能力</h2>
        <div className="grid">
          {features.map((feature) => (
            <article className="grid-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}