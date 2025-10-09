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
    const sessionId = searchParams.get('sessionId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!sessionId) {
      return Response.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id }
    });

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get messages for the session
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    logger.info('Messages fetched', { sessionId, userId: user.id, count: messages.length });

    return Response.json({ messages });
  } catch (error) {
    logger.error('Failed to get messages', { error });
    return Response.json({ error: 'Failed to get messages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { sessionId, role, content, tokens, latencyMs } = await request.json();

    if (!sessionId || !role || !content) {
      return Response.json({ 
        error: 'Session ID, role, and content are required' 
      }, { status: 400 });
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Verify the session exists and belongs to the user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id }
    });

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check if session is still active (not ended)
    if (session.endedAt) {
      return Response.json({ 
        error: 'Cannot add messages to completed session' 
      }, { status: 400 });
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

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');

    if (!messageId) {
      return Response.json({ error: 'Message ID is required' }, { status: 400 });
    }

    // Get message and verify ownership through session
    const message = await prisma.message.findFirst({
      where: { 
        id: messageId,
        session: { userId: user.id }
      },
      include: { session: true }
    });

    if (!message) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    // Check if session is still active (can only delete from active sessions)
    if (message.session.endedAt) {
      return Response.json({ 
        error: 'Cannot delete messages from completed session' 
      }, { status: 400 });
    }

    await prisma.message.delete({
      where: { id: messageId }
    });

    logger.info('Message deleted', { messageId, userId: user.id });

    return Response.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete message', { error });
    return Response.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}