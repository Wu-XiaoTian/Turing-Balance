import type { Metadata } from 'next';
import NavBar from '@/components/nav-bar';
// @ts-ignore — Next.js handles CSS imports natively
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
        <NavBar />
        {children}
      </body>
    </html>
  );
}