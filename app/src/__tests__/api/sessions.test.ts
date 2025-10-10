import { NextRequest } from 'next/server';

// Mock dependencies before importing modules that use them
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    prompt: {
      findFirst: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock LiveKit
jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    createRoom: jest.fn().mockResolvedValue({}),
  })),
}));

// Import after mocking
import { GET, POST, PATCH } from '@/app/api/sessions/route';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get the mocked functions
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as any;

describe('/api/sessions', () => {
  const mockUser = { 
    id: 'user-123', 
    email: 'test@example.com',
    token: 'test-token',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockPrompt = {
    id: 'prompt-123',
    title: 'Test Prompt',
    body: 'This is a test prompt for the agent.',
    userId: 'user-123',
    tags: '["tag1", "tag2"]',
    version: 1,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
  };

  const mockSession = {
    id: 'session-123',
    promptId: 'prompt-123',
    userId: 'user-123',
    startedAt: new Date('2023-01-01T10:00:00Z'),
    endedAt: null,
    metadata: '{"testData": true}',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    prompt: { title: 'Test Prompt', body: 'This is a test prompt for the agent.' },
    _count: { messages: 5 }
  };

  const mockSessions = [
    {
      ...mockSession,
      prompt: { title: 'Test Prompt' }, // GET only returns title
    },
    {
      id: 'session-124',
      promptId: 'prompt-123',
      userId: 'user-123',
      startedAt: new Date('2023-01-01T09:00:00Z'),
      endedAt: new Date('2023-01-01T09:30:00Z'),
      metadata: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
      prompt: { title: 'Test Prompt' }, // GET only returns title
      _count: { messages: 3 }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
  });

  describe('GET /api/sessions', () => {
    it('should return sessions for authenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);

      const request = new NextRequest('http://localhost/api/sessions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessions).toEqual(mockSessions);
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: {
          prompt: { select: { title: true } },
          _count: { select: { messages: true } }
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/sessions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should handle database errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/sessions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get sessions');
    });
  });

  describe('POST /api/sessions', () => {
    const validSessionData = {
      promptId: 'prompt-123',
      metadata: { testData: true, userInfo: 'test' }
    };

    it('should create session for authenticated user with valid prompt', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.create.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-123',
        sessionId: 'session-123',
        role: 'system',
        content: 'Initial instruction: This is a test prompt for the agent.',
        tokens: null,
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session).toEqual(mockSession);
      
      // Verify session creation steps
      expect(mockPrisma.prompt.findFirst).toHaveBeenCalledWith({
        where: { id: 'prompt-123', userId: 'user-123' }
      });
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', endedAt: null },
        data: { endedAt: expect.any(Date) }
      });
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: {
          promptId: 'prompt-123',
          userId: 'user-123',
          metadata: JSON.stringify(validSessionData.metadata),
        },
        include: {
          prompt: { select: { title: true, body: true } },
          _count: { select: { messages: true } }
        }
      });
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-123',
          role: 'system',
          content: 'Initial instruction: This is a test prompt for the agent.',
          tokens: null,
        }
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 400 when promptId is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ metadata: { test: true } }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Prompt ID is required');
    });

    it('should return 404 when prompt not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Prompt not found');
    });

    it('should handle LiveKit room creation with proper credentials', async () => {
      // Set up LiveKit environment variables
      process.env.LIVEKIT_API_KEY = 'test-api-key';
      process.env.LIVEKIT_API_SECRET = 'test-api-secret';
      process.env.LIVEKIT_URL = 'wss://test.livekit.io';

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.create.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-123',
        sessionId: 'session-123',
        role: 'system',
        content: 'Initial instruction: This is a test prompt for the agent.',
        tokens: null,
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session).toEqual(mockSession);
    });

    it('should handle session creation without LiveKit credentials', async () => {
      // No LiveKit environment variables set
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findFirst.mockResolvedValue(mockPrompt);
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.session.create.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-123',
        sessionId: 'session-123',
        role: 'system',
        content: 'Initial instruction: This is a test prompt for the agent.',
        tokens: null,
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session).toEqual(mockSession);
    });

    it('should handle database errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.prompt.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'POST',
        body: JSON.stringify(validSessionData),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create session');
    });
  });

  describe('PATCH /api/sessions', () => {
    it('should end session for authenticated user', async () => {
      const endedSession = {
        ...mockSession,
        endedAt: new Date(),
      };

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.update.mockResolvedValue(endedSession);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: 'session-123',
          action: 'end'
        }),
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session).toEqual(endedSession);
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-123', userId: 'user-123' },
        data: { endedAt: expect.any(Date) },
        include: {
          prompt: { select: { title: true } },
          _count: { select: { messages: true } }
        }
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: 'session-123',
          action: 'end'
        }),
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 400 when sessionId or action is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'PATCH',
        body: JSON.stringify({ sessionId: 'session-123' }), // missing action
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session ID and action are required');
    });

    it('should return 400 for invalid action', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: 'session-123',
          action: 'invalid-action'
        }),
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid action');
    });

    it('should handle database errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.update.mockRejectedValue(new Error('Database update failed'));

      const request = new NextRequest('http://localhost/api/sessions', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: 'session-123',
          action: 'end'
        }),
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update session');
    });
  });
});