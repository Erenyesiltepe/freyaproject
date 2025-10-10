import { NextRequest } from 'next/server';

// Mock dependencies before importing modules that use them
jest.mock('@/lib/auth', () => ({
  loginOrCreateUser: jest.fn(),
  getCurrentUser: jest.fn(),
  clearAuthCookie: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { loginOrCreateUser, getCurrentUser, clearAuthCookie } from '@/lib/auth';

// Get the mocked functions
const mockLoginOrCreateUser = loginOrCreateUser as jest.MockedFunction<typeof loginOrCreateUser>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockClearAuthCookie = clearAuthCookie as jest.MockedFunction<typeof clearAuthCookie>;

describe('/api/auth', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    token: 'test-token-123',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should login existing user successfully', async () => {
      mockLoginOrCreateUser.mockResolvedValue({
        user: mockUser,
        token: 'test-token-123',
      });

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      });

      // Check that the cookie is set in the response headers
      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('dev-token=test-token-123');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('Path=/');
      expect(setCookieHeader).toContain('Max-Age=604800'); // 7 days in seconds
      expect(setCookieHeader).toContain('SameSite=Lax');

      expect(mockLoginOrCreateUser).toHaveBeenCalledWith('test@example.com');
    });

    it('should create new user successfully', async () => {
      const newUser = {
        ...mockUser,
        id: 'user-new',
        email: 'newuser@example.com',
      };

      mockLoginOrCreateUser.mockResolvedValue({
        user: newUser,
        token: 'new-token-456',
      });

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'newuser@example.com' }),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user).toEqual({
        id: 'user-new',
        email: 'newuser@example.com',
      });

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('dev-token=new-token-456');

      expect(mockLoginOrCreateUser).toHaveBeenCalledWith('newuser@example.com');
    });

    it('should return 400 when email is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');

      expect(mockLoginOrCreateUser).not.toHaveBeenCalled();
    });

    it('should return 400 when email is not a string', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 123 }),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');

      expect(mockLoginOrCreateUser).not.toHaveBeenCalled();
    });

    it('should return 400 when email is empty string', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: '' }),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');

      expect(mockLoginOrCreateUser).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Login failed');
    });

    it('should handle login errors gracefully', async () => {
      mockLoginOrCreateUser.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await loginPost(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Login failed');

      expect(mockLoginOrCreateUser).toHaveBeenCalledWith('test@example.com');
    });

    it('should set secure cookie in production', async () => {
      // Mock production environment by setting the env before importing
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';

      mockLoginOrCreateUser.mockResolvedValue({
        user: mockUser,
        token: 'test-token-123',
      });

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await loginPost(request);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Secure');

      // Restore original environment
      (process.env as any).NODE_ENV = originalEnv;
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost/api/auth/me');
      const response = await meGet();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      });

      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await meGet();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Not authenticated');

      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it('should handle getCurrentUser errors gracefully', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await meGet();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get user');

      expect(mockGetCurrentUser).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user successfully', async () => {
      mockClearAuthCookie.mockResolvedValue(undefined);

      const response = await logoutPost();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Check that the cookie is cleared in the response headers
      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('dev-token=');
      expect(setCookieHeader).toContain('Max-Age=0');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('Path=/');
      expect(setCookieHeader).toContain('SameSite=Lax');

      expect(mockClearAuthCookie).toHaveBeenCalled();
    });

    it('should handle logout errors gracefully', async () => {
      mockClearAuthCookie.mockRejectedValue(new Error('Cookie clearing failed'));

      const response = await logoutPost();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Logout failed');

      expect(mockClearAuthCookie).toHaveBeenCalled();
    });

    it('should set secure cookie in production', async () => {
      // Mock production environment
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';

      mockClearAuthCookie.mockResolvedValue(undefined);

      const response = await logoutPost();

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Secure');

      // Restore original environment
      (process.env as any).NODE_ENV = originalEnv;
    });
  });
});