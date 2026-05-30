import { NextResponse } from 'next/server';
import { readSystemParameters, upsertSystemParameter, readOrFallbackUserProfile } from '@/lib/supabase';

export async function GET() {
  const parameters = await readSystemParameters();
  return NextResponse.json({ ok: true, parameters });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    key?: string;
    value?: string;
    description?: string;
    updatedBy?: string;
  };

  if (!body.key || body.value === undefined) {
    return NextResponse.json({ ok: false, error: '参数键名和值不能为空。' }, { status: 400 });
  }

  const { error } = await upsertSystemParameter({
    key: body.key,
    value: String(body.value),
    description: body.description,
    updatedBy: body.updatedBy
  });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ ok: false, error: '需要提供参数键名。' }, { status: 400 });
  }

  // Use Supabase REST API to delete
  const { supabaseUrl, supabaseServiceRoleKey } = await import('@/lib/supabase').then((m) => ({
    supabaseUrl: (m as unknown as { supabaseUrl: string }).supabaseUrl,
    supabaseServiceRoleKey: (m as unknown as { supabaseServiceRoleKey: string }).supabaseServiceRoleKey
  }));

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase 服务端配置缺失。' }, { status: 500 });
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/system_parameters?key=eq.${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: supabaseServiceRoleKey,
        authorization: `Bearer ${supabaseServiceRoleKey}`
      }
    }
  );

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: '删除失败。' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
