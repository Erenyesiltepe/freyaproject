import { clearAuthCookie } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    await clearAuthCookie();
    
    const response = Response.json({ success: true });
    
    // Clear the cookie in the response as well
    response.headers.set(
      'Set-Cookie',
      `dev-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    );

    logger.info('User logged out successfully');
    return response;
  } catch (error) {
    logger.error('Logout failed', { error });
    return Response.json({ error: 'Logout failed' }, { status: 500 });
  }
}