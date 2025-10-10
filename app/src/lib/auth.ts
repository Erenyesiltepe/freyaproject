import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { logger } from './logger';

const DEV_TOKEN_COOKIE = 'dev-token';

export async function generateDevToken(): Promise<string> {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function loginOrCreateUser(email: string): Promise<{ user: any; token: string }> {
  // First, try to find existing user
  let user = await prisma.user.findUnique({
    where: { email },
  });

  let token: string;

  if (user) {
    // User exists, generate new token and update
    token = await generateDevToken();
    user = await prisma.user.update({
      where: { id: user.id },
      data: { token },
    });
    logger.info('Existing user logged in', { userId: user.id, email });
  } else {
    // User doesn't exist, create new one
    token = await generateDevToken();
    user = await prisma.user.create({
      data: {
        email,
        token,
      },
    });
    logger.info('New dev user created', { userId: user.id, email });
  }

  return { user, token };
}

export async function createDevUser(email: string): Promise<{ user: any; token: string }> {
  // Deprecated: Use loginOrCreateUser instead
  return loginOrCreateUser(email);
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
    secure: false, // Disabled for local development (even in production build)
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/', // Ensure cookie is available across the whole app
  });
}

export async function clearAuthCookie() {
  const cookieStore = cookies();
  (await cookieStore).delete(DEV_TOKEN_COOKIE);
}