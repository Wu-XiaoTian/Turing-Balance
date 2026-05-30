import Link from 'next/link';

const features = [
  {
    title: '🧠 AI 智商 / 情商评估',
    body: '通过专业题库对 AI 进行逻辑推理、情绪理解和综合判断能力测试，生成多维度评估报告。',
    href: '/evaluation'
  },
  {
    title: '💞 华清池 AI 伴侣匹配',
    body: '填写兴趣、人格与需求问卷，通过多维度兼容度计算，为您推荐最匹配的 AI 伴侣。',
    href: '/matching'
  },
  {
    title: '🔐 用户认证系统',
    body: '支持邮箱注册与登录，保障您的评估记录与匹配偏好安全存储。',
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
          一个 AI 评估与匹配平台。覆盖<strong> AI 智商/情商评估</strong>、
          <strong> 华清池 AI 伴侣匹配</strong>、<strong>用户认证管理</strong>三大核心模块。
        </p>
        <div className="hero-actions">
          <Link className="button" href="/evaluation">
            开始评估
          </Link>
          <Link className="button" href="/matching" style={{ background: 'linear-gradient(135deg, #fb7185, #f59e0b)' }}>
            开始匹配
          </Link>
        </div>

        <div className="nav" aria-label="quick links">
          <Link className="nav-link" href="/evaluation">评估</Link>
          <Link className="nav-link" href="/matching">匹配</Link>
          <Link className="nav-link" href="/auth?mode=login">登录</Link>
          <Link className="nav-link" href="/auth?mode=register">注册</Link>
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

      <section className="section">
        <h2 className="section-title">系统架构</h2>
        <div className="panel stack">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>🎨</div>
              <h4>表现层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>登录界面<br/>评估界面<br/>匹配界面</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>🎮</div>
              <h4>控制层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>登录管理<br/>评估服务<br/>匹配控制</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>⚙️</div>
              <h4>服务层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>评估管理<br/>匹配管理<br/>画像构建</p>
            </div>
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ fontSize: '2rem' }}>💾</div>
              <h4>数据层</h4>
              <p className="muted" style={{ fontSize: '0.85rem' }}>评分引擎<br/>匹配引擎<br/>题库管理</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}