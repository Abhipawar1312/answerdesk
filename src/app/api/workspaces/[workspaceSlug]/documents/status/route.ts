import { NextResponse } from 'next/server';
import { authenticateWorkspaceApi } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import { getWorkspaceDocuments } from '@/lib/db/scoped-queries';

export async function GET(
  _req: Request,
  props: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await props.params;
    const authResult = await authenticateWorkspaceApi(workspaceSlug);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { workspace } = authResult;
    await connectDB();
    const docs = await getWorkspaceDocuments(workspace._id);

    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d._id.toString(),
        status: d.status,
        chunkCount: d.chunkCount,
        errorMessage: d.errorMessage,
      })),
    });
  } catch (err: unknown) {
    console.error('[Document Status API Error]:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while checking document statuses.' },
      { status: 500 }
    );
  }
}

