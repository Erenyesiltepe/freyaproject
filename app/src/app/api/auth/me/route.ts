import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return Response.json({ 
      user: { id: user.id, email: user.email } 
    });
  } catch (error) {
    logger.error('Get current user failed', { error });
    return Response.json({ error: 'Failed to get user' }, { status: 500 });
  }
}