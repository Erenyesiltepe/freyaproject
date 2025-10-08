import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { logger } from './logger';

const DEV_TOKEN_COOKIE = 'dev-token';

export async function generateDevToken(): Promise<string> {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function createDevUser(email: string): Promise<{ user: any; token: string }> {
  const token = await generateDevToken();
  
  const user = await prisma.user.create({
    data: {
      email,
      token,
    },
  });

  logger.info('Dev user created', { userId: user.id, email });
  return { user, token };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEV_TOKEN_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { token },
    });
    return user;
  } catch (error) {
    logger.error('Failed to get current user', { error });
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = cookies();
  (await cookieStore).set(DEV_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}