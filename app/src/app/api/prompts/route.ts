import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tagsToString, tagsFromString } from '@/lib/tags';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];

    logger.info('Searching prompts', { search, tags, userId: user.id });

    let whereClause: any = { userId: user.id };

    if (search) {
      whereClause.AND = [
        { userId: user.id },
        {
          OR: [
            { title: { contains: search } },
            { body: { contains: search } },
          ]
        }
      ];
      // Remove the top-level userId since it's now in AND
      delete whereClause.userId;
    }

    const prompts = await prisma.prompt.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
    });

    // Filter by tags and convert tags from JSON
    const filteredPrompts = prompts
      .map(prompt => ({
        ...prompt,
        tags: tagsFromString(prompt.tags),
      }))
      .filter(prompt => {
        if (tags.length === 0) return true;
        return tags.some(tag => prompt.tags.includes(tag));
      });

    logger.info('Search results', { totalFound: filteredPrompts.length });

    return Response.json({ prompts: filteredPrompts });
  } catch (error) {
    logger.error('Failed to get prompts', { error });
    return Response.json({ error: 'Failed to get prompts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { title, body, tags = [] } = await request.json();

    if (!title || !body) {
      return Response.json({ error: 'Title and body are required' }, { status: 400 });
    }

    const prompt = await prisma.prompt.create({
      data: {
        title,
        body,
        tags: tagsToString(tags),
        userId: user.id,
      },
    });

    logger.info('Prompt created', { promptId: prompt.id, userId: user.id });

    return Response.json({ 
      prompt: { ...prompt, tags: tagsFromString(prompt.tags) } 
    });
  } catch (error) {
    logger.error('Failed to create prompt', { error });
    return Response.json({ error: 'Failed to create prompt' }, { status: 500 });
  }
}