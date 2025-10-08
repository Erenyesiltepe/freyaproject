import { NextRequest } from 'next/server';
import { createDevUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const { user, token } = await createDevUser(email);
    
    // Set cookie
    const response = Response.json({ 
      success: true, 
      user: { id: user.id, email: user.email } 
    });
    
    response.headers.set(
      'Set-Cookie',
      `dev-token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    );

    return response;
  } catch (error) {
    logger.error('Login failed', { error });
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}