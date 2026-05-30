import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Turing Balance',
  description: '测试不同 AI 的智商和情商，并支持 AI 伴侣匹配推荐。'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}