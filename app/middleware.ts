import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('dev-token')?.value;
  const { pathname } = request.nextUrl;

  // If user is trying to access login page and already has a token, redirect to console
  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/console', request.url));
  }

  // If user is trying to access protected routes without token, redirect to login
  if (pathname.startsWith('/console') && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is at root and has token, redirect to console
  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/console', request.url));
  }

  // If user is at root and has no token, redirect to login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};