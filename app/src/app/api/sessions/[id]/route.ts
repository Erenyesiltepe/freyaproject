import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = id;

    const session = await prisma.session.findFirst({
      where: { 
        id: sessionId,
        userId: user.id // Ensure user owns this session
      },
      include: {
        prompt: { select: { title: true, body: true } },
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse metadata if it exists
    const sessionWithParsedData = {
      ...session,
      metadata: session.metadata ? JSON.parse(session.metadata) : {},
      messages: session.messages.map(msg => ({
        ...msg,
        tokens: msg.tokens ? JSON.parse(msg.tokens) : null
      }))
    };

    logger.info('Session fetched', { sessionId, userId: user.id });

    return Response.json({ session: sessionWithParsedData });
  } catch (error) {
    logger.error('Failed to get session', { error });
    return Response.json({ error: 'Failed to get session' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const sessionId = id;
    const { endedAt, metadata } = await request.json();

    const session = await prisma.session.update({
      where: { 
        id: sessionId,
        userId: user.id
      },
      data: {
        ...(endedAt && { endedAt: new Date(endedAt) }),
        ...(metadata && { metadata: JSON.stringify(metadata) }),
      }
    });

    logger.info('Session updated', { sessionId, userId: user.id });

    return Response.json({ session });
  } catch (error) {
    logger.error('Failed to update session', { error });
    return Response.json({ error: 'Failed to update session' }, { status: 500 });
  }
}