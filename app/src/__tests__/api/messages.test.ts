import { NextRequest } from 'next/server';

// Mock dependencies before importing modules that use them
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
import { GET, POST, DELETE } from '@/app/api/messages/route';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get the mocked functions
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as any;

describe('/api/messages', () => {
  const mockUser = { 
    id: 'user-123', 
    email: 'test@example.com',
    token: 'test-token',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };
  const mockSession = { id: 'session-123', userId: 'user-123', endedAt: null };
  const mockMessages = [
    {
      id: 'msg-1',
      sessionId: 'session-123',
      role: 'user',
      content: 'Hello',
      timestamp: new Date('2023-01-01T10:00:00Z'),
      tokens: null,
      latencyMs: null,
    },
    {
      id: 'msg-2',
      sessionId: 'session-123',
      role: 'assistant',
      content: 'Hello! How can I help you?',
      timestamp: new Date('2023-01-01T10:00:05Z'),
      tokens: '["Hello!", "How", "can", "I", "help", "you?"]',
      latencyMs: 250,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/messages', () => {
    it('should return messages for authenticated user with valid session', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockPrisma.message.findMany.mockResolvedValue(mockMessages);

      const request = new NextRequest('http://localhost/api/messages?sessionId=session-123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.messages).toEqual(mockMessages);
      expect(mockPrisma.session.findFirst).toHaveBeenCalledWith({
        where: { id: 'session-123', userId: 'user-123' }
      });
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-123' },
        orderBy: { timestamp: 'asc' },
        take: 50,
      });
    });

    it('should return 401 for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/messages?sessionId=session-123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should return 400 when sessionId is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/messages');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session ID is required');
    });

    it('should return 404 when session not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/messages?sessionId=session-123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Session not found');
    });
  });

  describe('POST /api/messages', () => {
    const validMessage = {
      sessionId: 'session-123',
      role: 'user',
      content: 'Test message',
      tokens: ['Test', 'message'],
      latencyMs: 100,
    };

    it('should create message for authenticated user with valid data', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-new',
        ...validMessage,
        tokens: JSON.stringify(validMessage.tokens),
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify(validMessage),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message.id).toBe('msg-new');
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-123',
          role: 'user',
          content: 'Test message',
          tokens: '["Test","message"]',
          latencyMs: 100,
        }
      });
    });

    it('should return 400 for invalid role', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          ...validMessage,
          role: 'invalid-role',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid role');
    });

    it('should return 400 when trying to add message to completed session', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue({
        ...mockSession,
        endedAt: new Date(),
      });

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify(validMessage),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot add messages to completed session');
    });

    it('should handle token rate calculation', async () => {
      const messageWithManyTokens = {
        ...validMessage,
        content: 'This is a longer message with many tokens for testing rate calculation',
        tokens: ['This', 'is', 'a', 'longer', 'message', 'with', 'many', 'tokens', 'for', 'testing', 'rate', 'calculation'],
        latencyMs: 1200, // 1.2 seconds
      };

      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-tokens',
        ...messageWithManyTokens,
        tokens: JSON.stringify(messageWithManyTokens.tokens),
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify(messageWithManyTokens),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // Verify tokens were stored as JSON string
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokens: expect.stringContaining('This'),
          latencyMs: 1200,
        })
      });

      // Calculate expected token rate: 12 tokens / 1.2 seconds = 10 tokens/second
      const tokensCount = messageWithManyTokens.tokens.length;
      const latencySeconds = messageWithManyTokens.latencyMs / 1000;
      const expectedTokenRate = tokensCount / latencySeconds;
      
      expect(expectedTokenRate).toBe(10); // 12 tokens / 1.2 seconds = 10 tokens/second
    });
  });

  describe('Error pathways', () => {
    it('should handle database errors gracefully in GET', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/messages?sessionId=session-123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get messages');
    });

    it('should handle database errors gracefully in POST', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.session.findFirst.mockResolvedValue(mockSession);
      mockPrisma.message.create.mockRejectedValue(new Error('Database write failed'));

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'session-123',
          role: 'user',
          content: 'Test message',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create message');
    });

    it('should handle malformed JSON in POST', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/messages', {
        method: 'POST',
        body: 'invalid json',
      });

      // The API should catch JSON parsing errors and return 500
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create message');
    });
  });
});