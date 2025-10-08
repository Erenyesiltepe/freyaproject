'use client';

import { useState, useEffect } from 'react';
import { Login } from '@/components/login';
import { PromptLibrary } from '@/components/prompt-library';
import { HealthCheck } from '@/components/health-check';

interface User {
  email: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={checkAuth} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto p-4">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Agent Console
          </h1>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Welcome, {user.email}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Prompt Library
            </h2>
            <PromptLibrary />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              System Health
            </h2>
            <HealthCheck />
          </div>
        </div>
      </div>
    </div>
  );
}
