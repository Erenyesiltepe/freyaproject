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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (startedAt: string, endedAt?: string) => {
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const isActive = (session: Session) => !session.endedAt;

  const getStatusBadge = (session: Session) => {
    if (isActive(session)) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Completed
        </span>
      );
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

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
              } ${!isActive(session) ? 'opacity-75' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate flex-1">
                    {session.prompt.title}
                    {!isActive(session) && (
                      <span className="text-xs text-gray-500 ml-2">(Read-only)</span>
                    )}
                  </h4>
                  {getStatusBadge(session)}
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>Started: {formatDate(session.startedAt)}</span>
                    <span>{session._count.messages} messages</span>
                  </div>
                  
                  {session.endedAt && (
                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                      <span>Duration: {formatDuration(session.startedAt, session.endedAt)}</span>
                      <span>Ended: {formatDate(session.endedAt)}</span>
                    </div>
                  )}
                  
                  {isActive(session) && (
                    <div className="text-xs text-green-600 dark:text-green-400">
                      ● Currently active - can send messages
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}