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