import { handleAuthRequest } from '@/lib/auth-flow';

export async function POST(request: Request) {
  return handleAuthRequest(request);
}