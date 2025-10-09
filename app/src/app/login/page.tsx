'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Login } from '@/components/login';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          // If already logged in, redirect to console
          router.push('/console');
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  const handleLogin = async () => {
    // Refresh auth state and redirect
    router.push('/console');
    router.refresh();
  };

  return <Login onLogin={handleLogin} />;
}