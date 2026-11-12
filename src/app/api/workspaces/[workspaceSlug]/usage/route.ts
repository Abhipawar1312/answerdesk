import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { authenticateWorkspaceApi } from '@/lib/auth/dal';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  await connection();
  const { workspaceSlug } = await params;
  const authResult = await authenticateWorkspaceApi(workspaceSlug);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const ws = authResult.workspace;

  return NextResponse.json(
    {
      monthlyMessageCount: ws.monthlyMessageCount ?? 0,
      messageLimit: ws.messageLimit ?? 100,
      plan: ws.plan ?? 'free',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
