'use client';

import { useState, useEffect } from 'react';

export default function TestAuthPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4">
      <h1>Authentication Test</h1>
      {user ? (
        <div>
          <p>✅ Authenticated</p>
          <p>User ID: {user.id}</p>
          <p>Email: {user.email}</p>
        </div>
      ) : (
        <p>❌ Not authenticated</p>
      )}
    </div>
  );
}