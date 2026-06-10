/*
 * ==========================================================================
 * 导航栏组件 — 基于用户角色显示不同菜单
 * ==========================================================================
 * - 未登录: 评估 | 匹配 | 登录
 * - 普通用户: 评估 | 匹配 | 我的数据 | 退出
 * - 管理员: 评估 | 匹配 | 管理 | 退出
 * ==========================================================================
 */

"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { readAuthSession, clearAuthSession, type AuthSessionState } from '@/lib/auth-session';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSession(readAuthSession());
    setMounted(true);

    const refresh = () => setSession(readAuthSession());
    window.addEventListener('storage', refresh);
    window.addEventListener('turing-auth-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('turing-auth-changed', refresh);
    };
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    setSession(null);
    router.push('/');
  };

  const isAdmin = session?.user?.role === 'administrator';
  const isLoggedIn = !!session;

  const linkStyle = (href: string) => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontWeight: pathname === href ? 700 : 400,
    opacity: pathname === href ? 1 : 0.7,
    transition: 'all 0.2s',
  });

  return (
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.9rem' }}>
        <Link href="/evaluation" className="nav-link" style={linkStyle('/evaluation')}>评估</Link>
        <Link href="/matching" className="nav-link" style={linkStyle('/matching')}>匹配</Link>

        {mounted && isLoggedIn ? (
          <>
            {isAdmin ? (
              <Link href="/admin" className="nav-link" style={linkStyle('/admin')}>管理</Link>
            ) : (
              <Link href="/evaluation" className="nav-link" style={{ padding: '6px 14px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  👤 {session?.user?.username ?? '我的'}
                </span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="nav-link"
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              退出
            </button>
          </>
        ) : (
          <Link href="/auth?mode=login" className="nav-link" style={linkStyle('/auth')}>登录</Link>
        )}
      </div>
    </nav>
  );
}
