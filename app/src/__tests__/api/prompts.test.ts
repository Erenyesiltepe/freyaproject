import { NextRequest } from 'next/server';

// Mock dependencies before importing modules that use them
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    prompt: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/tags', () => ({
  tagsToString: jest.fn(),
  tagsFromString: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
import { GET, POST } from '@/app/api/prompts/route';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tagsToString, tagsFromString } from '@/lib/tags';

// Get the mocked functions
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as any;
const mockTagsToString = tagsToString as jest.MockedFunction<typeof tagsToString>;
const mockTagsFromString = tagsFromString as jest.MockedFunction<typeof tagsFromString>;

describe('/api/prompts', () => {
  const mockUser = { 
    id: 'user-123', 
    email: 'test@example.com',
    token: 'test-token',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockPrompts = [
    {
      id: 'prompt-1',
      title: 'Test Prompt 1',
      body: 'This is the first test prompt',
      tags: '["tag1","tag2"]',
      version: 1,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      userId: 'user-123',
    },
    {
      id: 'prompt-2',
      title: 'Test Prompt 2',
      body: 'This is the second test prompt',
      tags: '["tag2","tag3"]',
      version: 2,
      createdAt: new Date('2023-01-02T00:00:00Z'),
      updatedAt: new Date('2023-01-02T00:00:00Z'),
      userId: 'user-123',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockTagsToString.mockImplementation((tags: string[]) => JSON.stringify(tags));
    mockTagsFromString.mockImplementation((tagsStr: string) => JSON.parse(tagsStr));
  });

  describe('GET /api/prompts', () => {
    it('should return prompts for authenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findMany.mockResolvedValue(mockPrompts);

      const request = new NextRequest('http://localhost/api/prompts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.prompts).toEqual([
        { ...mockPrompts[0], tags: ['tag1', 'tag2'] },
        { ...mockPrompts[1], tags: ['tag2', 'tag3'] },
      ]);
      expect(mockPrisma.prompt.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter prompts by search query', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findMany.mockResolvedValue([mockPrompts[0]]);

      const request = new NextRequest('http://localhost/api/prompts?search=first');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.prompt.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { userId: 'user-123' },
            {
              OR: [
                { title: { contains: 'first' } },
                { body: { contains: 'first' } },
              ]
            }
          ]
        },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter prompts by tags', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findMany.mockResolvedValue(mockPrompts);

      const request = new NextRequest('http://localhost/api/prompts?tags=tag1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.prompts).toEqual([
        { ...mockPrompts[0], tags: ['tag1', 'tag2'] },
      ]); // Only prompt-1 has tag1
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/prompts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should handle database errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/prompts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get prompts');
    });
  });

  describe('POST /api/prompts', () => {
    const validPromptData = {
      title: 'New Test Prompt',
      body: 'This is a new test prompt body',
      tags: ['new-tag', 'test-tag'],
    };

    it('should create prompt for authenticated user with valid data', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const createdPrompt = {
        id: 'prompt-new',
        ...validPromptData,
        tags: JSON.stringify(validPromptData.tags),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-123',
      };
      mockPrisma.prompt.create.mockResolvedValue(createdPrompt);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify(validPromptData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.prompt).toEqual({
        ...createdPrompt,
        tags: validPromptData.tags, // Should be parsed back
      });
      expect(mockPrisma.prompt.create).toHaveBeenCalledWith({
        data: {
          title: 'New Test Prompt',
          body: 'This is a new test prompt body',
          tags: JSON.stringify(['new-tag', 'test-tag']),
          userId: 'user-123',
        }
      });
    });

    it('should create prompt with empty tags array', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const promptData = {
        title: 'Prompt without tags',
        body: 'This prompt has no tags',
        tags: [],
      };
      const createdPrompt = {
        id: 'prompt-no-tags',
        ...promptData,
        tags: JSON.stringify([]),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-123',
      };
      mockPrisma.prompt.create.mockResolvedValue(createdPrompt);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify(promptData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockTagsToString).toHaveBeenCalledWith([]);
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify(validPromptData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 400 when title is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({
          body: 'Body without title',
          tags: ['tag1'],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Title and body are required');
    });

    it('should return 400 when body is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Title without body',
          tags: ['tag1'],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Title and body are required');
    });

    it('should handle malformed JSON gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: 'invalid json',
      });

      // The API should catch JSON parsing errors and return 500
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create prompt');
    });

    it('should handle database errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.create.mockRejectedValue(new Error('Database write failed'));

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify(validPromptData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create prompt');
    });
  });
});