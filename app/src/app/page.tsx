'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';

export default function Home() {
  useEffect(() => {
    // Check auth and redirect accordingly
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          redirect('/console');
        } else {
          redirect('/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        redirect('/login');
      }
    };

    checkAuth();
  }, []);

  // Show loading while checking auth and redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div>Loading...</div>
    </div>
  );
}
