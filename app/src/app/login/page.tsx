'use client';

import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import { Login } from '@/components/login';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          // If already logged in, redirect to console
          redirect('/console');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  const handleLogin = async () => {
    redirect('/console');
  };

  return <Login onLogin={handleLogin} />;
}