'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Session {
  id: string;
  promptId: string;
  startedAt: string;
  endedAt?: string;
  metadata?: any;
  prompt: {
    title: string;
  };
  _count: {
    messages: number;
  };
}

interface RecentSessionsProps {
  onSelectSession: (sessionId: string) => void;
  selectedSessionId?: string;
}

export function RecentSessions({ onSelectSession, selectedSessionId }: RecentSessionsProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sessions?limit=10');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      } else {
        console.error('Failed to load sessions');
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSessionStatus = (session: Session) => {
    return session.endedAt ? 'Completed' : 'Active';
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Sessions
        </h3>
        <Button variant="outline" size="sm" onClick={loadSessions} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400">
            No sessions yet. Create a prompt and start a session!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <Card 
              key={session.id}
              className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 ${
                selectedSessionId === session.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate flex-1">
                    {session.prompt.title}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded ml-2 ${
                    session.endedAt 
                      ? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                      : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300'
                  }`}>
                    {getSessionStatus(session)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatDate(session.startedAt)}</span>
                  <span>{session._count.messages} messages</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}