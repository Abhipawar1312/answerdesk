import { NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { authenticateWorkspaceApi } from '@/lib/auth/dal';
import { connectDB } from '@/lib/db/mongoose';
import {
  searchWorkspaceChunks,
  createWorkspaceConversation,
  getWorkspaceConversationById,
  createWorkspaceMessage,
  countRecentWorkspaceTestMessages,
  checkAndRecordGlobalTestChatBudget,
  VectorIndexMissingError,
} from '@/lib/db/scoped-queries';
import { embedQuery, googleAI, classifyAIError } from '@/services/embedding-service';
import { buildChatPrompt, detectSystemPromptLeak } from '@/services/prompt-builder';
import { CHAT_CONFIG, TEST_CHAT_LIMITS } from '@/lib/constants';
import { detectGreetingOrThanks } from '@/lib/greetings';
import { resolveUsedCitations, cleanAnswerText } from '@/services/citation-resolver';

const testChatSchema = z.object({
  workspaceSlug: z.string().min(1),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter a question.')
    .max(TEST_CHAT_LIMITS.maxQueryLength, `Question cannot exceed ${TEST_CHAT_LIMITS.maxQueryLength} characters.`),
  conversationId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = testChatSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request payload.' },
        { status: 400 }
      );
    }

    const { workspaceSlug, message, conversationId } = parsed.data;

    // 1. Authenticate via DAL (owner authorization check)
    const authResult = await authenticateWorkspaceApi(workspaceSlug);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { workspace, session } = authResult;
    await connectDB();

    // 2. Owner Test Chat Limits: 20 test messages per hour per workspace
    const hourlyTestCount = await countRecentWorkspaceTestMessages(workspace._id, 3600 * 1000);
    if (hourlyTestCount >= TEST_CHAT_LIMITS.maxMessagesPerHourPerWorkspace) {
      return NextResponse.json(
        {
          error: `You have reached the test chat limit of ${TEST_CHAT_LIMITS.maxMessagesPerHourPerWorkspace} messages per hour for this workspace. Please try again later.`,
        },
        { status: 429 }
      );
    }

    // 3. Global Test Chat Budget Check: Max 100 test chats daily project-wide to protect 500 RPD
    const budgetAvailable = await checkAndRecordGlobalTestChatBudget();
    if (!budgetAvailable) {
      return NextResponse.json(
        {
          error: 'The daily test chat quota has been reached across the platform. Please try again tomorrow.',
        },
        { status: 429 }
      );
    }

    // 4. Retrieve or create Conversation (flagged isTest: true)
    let conv = conversationId
      ? await getWorkspaceConversationById(workspace._id, conversationId)
      : null;

    if (!conv || !conv.isTest) {
      conv = await createWorkspaceConversation(workspace._id, {
        visitorId: session.user.id || 'owner-tester',
        isTest: true,
      });
    }

    // 4.5 Conversational Greetings & Thanks (Instant reply without model call)
    const greetingCheck = detectGreetingOrThanks(message, workspace.name);
    if (greetingCheck.isHandled && greetingCheck.reply) {
      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'user',
        content: message,
        isUnanswered: false,
      });

      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'assistant',
        content: greetingCheck.reply,
        isUnanswered: false,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'metadata',
                conversationId: conv!._id.toString(),
                isUnanswered: false,
                citations: [],
                topScore: 1.0,
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'text-delta',
                delta: greetingCheck.reply,
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // 5. Generate query embedding (768 dimensions, RETRIEVAL_QUERY)
    const queryVector = await embedQuery(message);

    // 6. Vector search chunks strictly scoped by workspaceId
    const searchResult = await searchWorkspaceChunks(workspace._id, queryVector);

    // 7. Persist User Message
    await createWorkspaceMessage(workspace._id, {
      conversationId: conv._id,
      role: 'user',
      content: message,
      isUnanswered: searchResult.isUnanswered,
      sourceChunkIds: searchResult.chunks.map((c) => c._id),
    });

    const encoder = new TextEncoder();

    // 8. UNANSWERED CASE: Decide unanswered BEFORE calling Gemini
    if (searchResult.isUnanswered || searchResult.chunks.length === 0) {
      const fallbackText =
        'I do not have enough information in the knowledge base to answer this question. Please reach out to customer support for further assistance.';

      // Persist assistant message in MongoDB
      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'assistant',
        content: fallbackText,
        isUnanswered: true,
      });

      // Stream fallback response immediately without calling Flash Lite
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'metadata',
                conversationId: conv!._id.toString(),
                isUnanswered: true,
                citations: [],
                topScore: searchResult.topScore,
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'text-delta',
                delta: fallbackText,
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // 9. ANSWERED CASE: Build injection-resistant prompt & stream Gemini Flash Lite
    const { systemPrompt, userPrompt } = buildChatPrompt(
      workspace.name,
      message,
      searchResult.chunks
    );

    const model = googleAI(CHAT_CONFIG.model);
    const result = streamText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 500,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let fullAssistantText = '';

        try {
          for await (const delta of result.textStream) {
            fullAssistantText += delta;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'text-delta',
                  delta,
                })}\n\n`
              )
            );
          }

          // Safety check: ensure answer does not repeat or leak system prompt text
          let finalAssistantContent = fullAssistantText;
          if (detectSystemPromptLeak(fullAssistantText)) {
            console.warn('[Prompt Guard] System prompt leak detected in model output. Redacting.');
            finalAssistantContent =
              'I do not have enough information in the knowledge base to answer this question. Please reach out to customer support for further assistance.';
          }

          // Resolve only the sources actually used/cited by the answer (at most 3)
          const usedCitations = resolveUsedCitations(
            finalAssistantContent,
            searchResult.chunks,
            message,
            true
          );

          // Emit metadata with ONLY used citations (at most 3)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'metadata',
                conversationId: conv!._id.toString(),
                isUnanswered: false,
                citations: usedCitations,
                topScore: searchResult.topScore,
              })}\n\n`
            )
          );

          // Persist assistant message with used citations to MongoDB
          await createWorkspaceMessage(workspace._id, {
            conversationId: conv!._id,
            role: 'assistant',
            content: cleanAnswerText(finalAssistantContent),
            citations: usedCitations,
            isUnanswered: false,
          });

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (streamErr: unknown) {
          const classified = classifyAIError(streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: classified.friendlyMessage,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    if (err instanceof VectorIndexMissingError) {
      return NextResponse.json(
        {
          error:
            'Vector search is not ready. The Atlas search index "vector_index" is missing or still building in MongoDB Atlas. See SETUP_FOR_ME.md.',
          isVectorIndexMissing: true,
        },
        { status: 503 }
      );
    }

    const classified = classifyAIError(err);
    return NextResponse.json({ error: classified.friendlyMessage }, { status: 500 });
  }
}

