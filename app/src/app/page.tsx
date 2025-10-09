'use client';

import { useState, useEffect } from 'react';
import { Login } from '@/components/login';
import { PromptLibrary } from '@/components/prompt-library';
import { HealthCheck } from '@/components/health-check';
import { RecentSessions } from '@/components/recent-sessions';
import { SessionViewer } from '@/components/session-viewer';
import { LiveChat } from '@/components/live-chat';
import { useSession } from '@/contexts/SessionContext';


function HomeContent() {
  const [user, setUser] = useState<{id: string; email: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const { selectedSessionId, selectSession, createSession } = useSession();

  const handleStartSession = async (promptId: string) => {
    try {
      const newSession = await createSession(promptId);
      if (newSession) {
        selectSession(newSession.id);
      } else {
        console.error('Failed to start session');
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

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
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Prompt Library
            </h2>
            <PromptLibrary onStartSession={handleStartSession} />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Recent Sessions
            </h2>
            <RecentSessions 
              onSelectSession={selectSession} 
              selectedSessionId={selectedSessionId || undefined} 
            />
            
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                System Health
              </h2>
              <HealthCheck />
            </div>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Live Chat with AI Agent
            </h2>
            <LiveChat 
              sessionId={selectedSessionId || undefined}
              userId={user?.id}
              username={user?.email || 'Guest'}
              roomName="agent-console-room"
            />
          </div>
          
          {selectedSessionId && (
            <div className="lg:col-span-3 mt-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Session Details
              </h2>
              <SessionViewer sessionId={selectedSessionId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
