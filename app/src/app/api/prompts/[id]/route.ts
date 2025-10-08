import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tagsToString, tagsFromString } from '@/lib/tags';
import { logger } from '@/lib/logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, body, tags = [] } = await request.json();
    const { id } = await params;
    const promptId = id; // Use string ID directly

    const prompt = await prisma.prompt.update({
      where: { 
        id: promptId,
        userId: user.id, // Ensure user owns this prompt
      },
      data: {
        title,
        body,
        tags: tagsToString(tags),
        version: { increment: 1 },
      },
    });

    logger.info('Prompt updated', { promptId: prompt.id, userId: user.id });

    return Response.json({ 
      prompt: { ...prompt, tags: tagsFromString(prompt.tags) } 
    });
  } catch (error) {
    logger.error('Failed to update prompt', { error });
    return Response.json({ error: 'Failed to update prompt' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const promptId = id; // Use string ID directly

    await prisma.prompt.delete({
      where: { 
        id: promptId,
        userId: user.id, // Ensure user owns this prompt
      },
    });

    logger.info('Prompt deleted', { promptId, userId: user.id });

    return Response.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete prompt', { error });
    return Response.json({ error: 'Failed to delete prompt' }, { status: 500 });
  }
}