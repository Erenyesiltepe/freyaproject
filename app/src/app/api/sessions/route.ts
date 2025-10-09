import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      include: {
        prompt: { select: { title: true } },
        _count: { select: { messages: true } }
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    logger.info('Sessions fetched', { userId: user.id, count: sessions.length });

    return Response.json({ sessions });
  } catch (error) {
    logger.error('Failed to get sessions', { error });
    return Response.json({ error: 'Failed to get sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { promptId, metadata = {} } = await request.json();

    if (!promptId) {
      return Response.json({ error: 'Prompt ID is required' }, { status: 400 });
    }

    // Verify the prompt exists and belongs to the user
    const prompt = await prisma.prompt.findFirst({
      where: { id: promptId, userId: user.id }
    });

    if (!prompt) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 });
    }

    // Mark all previous active sessions as completed (read-only)
    await prisma.session.updateMany({
      where: { 
        userId: user.id,
        endedAt: null // Sessions that are still active
      },
      data: { 
        endedAt: new Date() // Mark as completed
      }
    });

    // Create new session
    const session = await prisma.session.create({
      data: {
        promptId,
        userId: user.id,
        metadata: JSON.stringify(metadata),
      },
      include: {
        prompt: { select: { title: true, body: true } }
      }
    });

    logger.info('Session created', { sessionId: session.id, promptId, userId: user.id });

    return Response.json({ session });
  } catch (error) {
    logger.error('Failed to create session', { error });
    return Response.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sessionId, action } = await request.json();

    if (!sessionId || !action) {
      return Response.json({ error: 'Session ID and action are required' }, { status: 400 });
    }

    if (action === 'end') {
      // End a specific session
      const session = await prisma.session.update({
        where: { 
          id: sessionId,
          userId: user.id // Ensure user owns the session
        },
        data: { 
          endedAt: new Date()
        },
        include: {
          prompt: { select: { title: true } },
          _count: { select: { messages: true } }
        }
      });

      logger.info('Session ended', { sessionId: session.id, userId: user.id });
      return Response.json({ session });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('Failed to update session', { error });
    return Response.json({ error: 'Failed to update session' }, { status: 500 });
  }
}