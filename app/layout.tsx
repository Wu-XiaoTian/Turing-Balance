import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Turing Balance - 图灵天平',
  description: '衡量 AI 的智慧与温度——AI 智商情商评估与智能伴侣匹配平台。'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(11,16,32,0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <Link href="/" style={{ fontWeight: 700, fontSize: '1.05rem', fontFamily: 'Georgia, serif' }}>
            ⚖️ Turing Balance
          </Link>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: '0.9rem' }}>
            <Link href="/evaluation" className="nav-link" style={{ padding: '6px 14px' }}>评估</Link>
            <Link href="/matching" className="nav-link" style={{ padding: '6px 14px' }}>匹配</Link>
            <Link href="/auth?mode=login" className="nav-link" style={{ padding: '6px 14px' }}>登录</Link>
            <Link href="/admin" className="nav-link" style={{ padding: '6px 14px' }}>管理</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}