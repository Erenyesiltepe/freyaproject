'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PromptLibrary } from '@/components/prompt-library';
import { RecentSessions } from '@/components/recent-sessions';
import { LiveChat } from '@/components/live-chat';
import { Metrics } from '@/components/metrics';
import { useAuth, useLogout, useCreateSession } from '@/lib/queries';

export default function ConsolePage() {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // Use TanStack Query hooks
  const { data: authData, isLoading: authLoading, error: authError } = useAuth();
  const logoutMutation = useLogout();
  const createSessionMutation = useCreateSession();
  
  const user = authData?.user;

  const handleStartSession = async (promptId: string) => {
    try {
      const result = await createSessionMutation.mutateAsync(promptId);
      if (result?.session) {
        setSelectedSessionId(result.session.id);
      } else {
        console.error('Failed to start session');
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Handle authentication errors
  if (authError) {
    router.push('/login');
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto p-4">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Agent Console
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Welcome, {user?.email}
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="flex flex-col">
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Prompt Library
              </h2>
              <PromptLibrary onStartSession={handleStartSession} />
            </div>
              
            <div>
              <RecentSessions 
                onSelectSession={setSelectedSessionId} 
                selectedSessionId={selectedSessionId || undefined} 
              />
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
              roomName={`console-${selectedSessionId || 'default'}`}
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Agent Metrics & Logs
            </h2>
            <Metrics 
              sessionId={selectedSessionId || undefined}
              refreshInterval={10000}
            />
          </div>
        </div>
      </div>
    </div>
  );
}