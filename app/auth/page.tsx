import { AuthPanel } from '@/components/auth-panel';

export default async function AuthPage({
  searchParams
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const mode = resolvedSearchParams.mode === 'register' ? 'register' : 'login';

  return <AuthPanel mode={mode} />;
}