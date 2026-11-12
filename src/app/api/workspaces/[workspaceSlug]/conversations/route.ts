import { NextResponse } from 'next/server';
import { authenticateWorkspaceApi } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import { listWorkspaceConversations } from '@/lib/db/scoped-queries';

export async function GET(
  req: Request,
  props: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await props.params;
    const authResult = await authenticateWorkspaceApi(workspaceSlug);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { workspace } = authResult;
    const { searchParams } = new URL(req.url);
    const filterParam = searchParams.get('filter') === 'unanswered' ? 'unanswered' : 'all';

    await connectDB();
    const conversations = await listWorkspaceConversations(workspace._id, {
      filter: filterParam,
      limit: 50,
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error('[Conversations API Error]:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while loading conversations.' },
      { status: 500 }
    );
  }
}

