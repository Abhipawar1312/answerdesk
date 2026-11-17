import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { streamText } from 'ai';
import { connectDB } from '@/lib/db/mongoose';
import {
  getPublicWorkspaceBySlug,
  checkWorkspaceMessageQuota,
  incrementWorkspaceMessageCount,
  searchWorkspaceChunks,
  createWorkspaceConversation,
  getWorkspaceConversationById,
  createWorkspaceMessage,
  checkAndRecordGlobalPublicChatBudget,
  VectorIndexMissingError,
} from '@/lib/db/scoped-queries';
import { embedQuery, googleAI, classifyAIError } from '@/services/embedding-service';
import { buildChatPrompt, detectSystemPromptLeak } from '@/services/prompt-builder';
import { CHAT_CONFIG, TEST_CHAT_LIMITS } from '@/lib/constants';
import { getRateLimiter } from '@/lib/rate-limiter';
import { isPublicChatOriginAllowed } from '@/lib/origins';
import { detectGreetingOrThanks } from '@/lib/greetings';
import { resolveUsedCitations, cleanAnswerText } from '@/services/citation-resolver';

const publicChatSchema = z.object({
  workspaceSlug: z.string().min(1),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter a message.')
    .max(TEST_CHAT_LIMITS.maxQueryLength, `Message cannot exceed ${TEST_CHAT_LIMITS.maxQueryLength} characters.`),
  visitorId: z.string().min(1, 'Visitor identifier is required.'),
  conversationId: z.string().optional(),
  hostOrigin: z.string().optional(),
});

/**
 * Hashes client IP with a secret salt to preserve privacy while supporting rate limiting.
 */
function hashClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const rawIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || '127.0.0.1');
  const salt = process.env.RATE_LIMIT_SALT || process.env.AUTH_SECRET || 'answerdesk_salt_default';
  return crypto.createHash('sha256').update(`${rawIp}:${salt}`).digest('hex');
}

export async function POST(req: Request) {
  try {
    // 1. Per-IP Rate Limiting (Runs FIRST before any expensive DB or AI work)
    // All requests (including those subsequently refused for origin reasons) count toward this limit.
    const ipLimiter = getRateLimiter(20, 60);
    const hashedIp = hashClientIp(req);
    const ipCheck = await ipLimiter.limit(`ip:public:${hashedIp}`);

    if (!ipCheck.success) {
      return NextResponse.json(
        { error: 'You are sending messages too fast. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const json = await req.json();
    const parsed = publicChatSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request payload.' },
        { status: 400 }
      );
    }

    const { workspaceSlug, message, visitorId, conversationId, hostOrigin } = parsed.data;

    await connectDB();

    // 2. Fetch public workspace info
    const workspace = await getPublicWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    // 3. Validate Origin against Workspace Allowed Origins
    if (!isPublicChatOriginAllowed(req, workspace.allowedOrigins, hostOrigin)) {
      return NextResponse.json(
        { error: 'Requests from this domain are not permitted for this widget.' },
        { status: 403 }
      );
    }

    // 4. Per-Visitor Rate Limiting (10 messages per minute per workspace visitor)
    const visitorLimiter = getRateLimiter(10, 60);
    const visitorCheck = await visitorLimiter.limit(`vis:${workspace.slug}:${visitorId}`);

    if (!visitorCheck.success) {
      return NextResponse.json(
        { error: 'You are sending messages too fast. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    // 5. Monthly & Daily Plan Message Quota Check (Pre-check without incrementing)
    const quotaCheck = await checkWorkspaceMessageQuota(workspace._id);
    if (!quotaCheck.allowed) {
      const errorMessage =
        quotaCheck.reason === 'daily_limit'
          ? 'This workspace has reached its daily message limit. Please try again tomorrow.'
          : 'This workspace has reached its monthly message limit. Please try again next month or contact the site owner.';
      return NextResponse.json({ error: errorMessage }, { status: 429 });
    }

    // 5. Global Chat Budget Protection (friendly fallback when Gemini quota is low)
    const withinGlobalBudget = await checkAndRecordGlobalPublicChatBudget();
    if (!withinGlobalBudget) {
      return NextResponse.json(
        { error: 'Our AI assistant is currently experiencing high demand. Please try again in a few minutes.' },
        { status: 503 }
      );
    }

    // 6. Conversation retrieval or creation with Anti-Spoofing Check
    let conv = null;
    if (conversationId) {
      const existingConv = await getWorkspaceConversationById(workspace._id, conversationId);
      if (existingConv) {
        if (existingConv.visitorId !== visitorId) {
          return NextResponse.json(
            { error: 'Invalid conversation credentials for this visitor.' },
            { status: 403 }
          );
        }
        conv = existingConv;
      }
    }

    if (!conv) {
      conv = await createWorkspaceConversation(workspace._id, {
        visitorId,
        isTest: false,
      });
    }

    // 7. Check Conversational Greetings & Thanks (Free, no AI model, no quota consumption)
    const greetingCheck = detectGreetingOrThanks(message, workspace.name);
    if (greetingCheck.isHandled && greetingCheck.reply) {
      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'user',
        content: message,
        isGreeting: true,
      });

      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'assistant',
        content: greetingCheck.reply,
        citations: [],
        isUnanswered: false,
        isGreeting: true,
      });

      const ssePayload = [
        `data: ${JSON.stringify({ type: 'citations', citations: [] })}\n\n`,
        `data: ${JSON.stringify({ type: 'delta', delta: greetingCheck.reply })}\n\n`,
        `data: ${JSON.stringify({ type: 'done', conversationId: conv._id.toString(), isUnanswered: false })}\n\n`,
      ].join('');

      return new Response(ssePayload, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Record non-greeting customer message
    await createWorkspaceMessage(workspace._id, {
      conversationId: conv._id,
      role: 'user',
      content: message,
      isGreeting: false,
    });

    // 8. Embed Query & Search Knowledge Base
    const queryVector = await embedQuery(message);
    const searchResult = await searchWorkspaceChunks(workspace._id, queryVector);

    // 9. Unanswered Query Handling (Bypass generative model; does NOT consume monthly quota)
    if (searchResult.isUnanswered) {
      await createWorkspaceMessage(workspace._id, {
        conversationId: conv._id,
        role: 'assistant',
        content: CHAT_CONFIG.unansweredFallbackMessage,
        citations: [],
        isUnanswered: true,
      });

      const ssePayload = [
        `data: ${JSON.stringify({ type: 'citations', citations: [] })}\n\n`,
        `data: ${JSON.stringify({ type: 'delta', delta: CHAT_CONFIG.unansweredFallbackMessage })}\n\n`,
        `data: ${JSON.stringify({ type: 'done', conversationId: conv._id.toString(), isUnanswered: true })}\n\n`,
      ].join('');

      return new Response(ssePayload, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // 10. Construct grounded system & user prompt
    const { systemPrompt, userPrompt } = buildChatPrompt(
      workspace.name,
      message,
      searchResult.chunks
    );

    // 11. Stream generative answer from Gemini Flash Lite (output length capped at 500 tokens)
    const chatModel = googleAI(CHAT_CONFIG.model);

    const activeConversationId = conv._id;
    const activeWorkspaceId = workspace._id;

    // Setting: hide citation excerpts in widget & cap excerpt length at 120 chars
    const showSnippets = !workspace.hideCitationsInWidget;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponseText = '';
        let attempt = 0;

        while (true) {
          try {
            const result = streamText({
              model: chatModel,
              system: systemPrompt,
              prompt: userPrompt,
              maxOutputTokens: 500,
            });

            // 1. Stream response deltas
            for await (const textDelta of result.textStream) {
              fullResponseText += textDelta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta: textDelta })}\n\n`)
              );
            }
            break;
          } catch (streamErr) {
            const classified = classifyAIError(streamErr, 'chat-stream-public');
            // Retry ONCE with a short delay if failed before emitting any chunks
            if (attempt === 0 && fullResponseText === '' && classified.isRateLimit) {
              attempt++;
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: classified.friendlyMessage,
                })}\n\n`
              )
            );
            controller.close();
            return;
          }
        }

        try {
          // Safety check: ensure answer does not repeat or leak system prompt text
          let finalAssistantContent = fullResponseText;
          if (detectSystemPromptLeak(fullResponseText)) {
            console.warn('[Prompt Guard] System prompt leak detected in model output. Redacting.');
            finalAssistantContent = CHAT_CONFIG.unansweredFallbackMessage;
          }

          // 2. Resolve only the sources actually used/cited by the answer (at most 3)
          const usedCitations = resolveUsedCitations(
            finalAssistantContent,
            searchResult.chunks,
            message,
            showSnippets
          );

          // 3. Emit actually used citations
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'citations',
                citations: usedCitations.map((c) => ({
                  documentId: c.documentId.toString(),
                  sourceTitle: c.sourceTitle,
                  chunkIndex: c.chunkIndex,
                  textSnippet: c.textSnippet || '',
                })),
              })}\n\n`
            )
          );

          // 4. Atomically increment quota upon successfully answering and persist message only if non-empty
          const cleanedText = cleanAnswerText(finalAssistantContent);
          if (cleanedText.trim().length > 0) {
            await incrementWorkspaceMessageCount(activeWorkspaceId);

            await createWorkspaceMessage(activeWorkspaceId, {
              conversationId: activeConversationId,
              role: 'assistant',
              content: cleanedText,
              citations: usedCitations,
              isUnanswered: false,
              isGreeting: false,
            });
          }

          // 5. Emit completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                conversationId: activeConversationId.toString(),
                isUnanswered: false,
              })}\n\n`
            )
          );

          controller.close();
        } catch (postErr) {
          const classified = classifyAIError(postErr, 'chat-post-process-public');
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
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    if (err instanceof VectorIndexMissingError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    const classified = classifyAIError(err, 'chat-route-public');
    return NextResponse.json({ error: classified.friendlyMessage }, { status: 500 });
  }
}
