import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sessionId, role, content, tokens, latencyMs } = await request.json();

    if (!sessionId || !role || !content) {
      return Response.json({ error: 'Session ID, role, and content are required' }, { status: 400 });
    }

    // Verify the session exists and belongs to the user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id }
    });

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: {
        sessionId,
        role,
        content,
        tokens: tokens ? JSON.stringify(tokens) : null,
        latencyMs,
      }
    });

    logger.info('Message created', { messageId: message.id, sessionId, role, userId: user.id });

    return Response.json({ message });
  } catch (error) {
    logger.error('Failed to create message', { error });
    return Response.json({ error: 'Failed to create message' }, { status: 500 });
  }
}