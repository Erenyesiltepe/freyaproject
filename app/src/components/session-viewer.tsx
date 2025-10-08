'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Message {
  id: string;
  role: string;
  content: string;
  tokens?: any;
  latencyMs?: number;
  timestamp: string;
}

interface SessionData {
  id: string;
  promptId: string;
  startedAt: string;
  endedAt?: string;
  metadata?: any;
  prompt: {
    title: string;
    body: string;
  };
  messages: Message[];
}

interface SessionViewerProps {
  sessionId: string | null;
}

export function SessionViewer({ sessionId }: SessionViewerProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSession = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
        console.error('Failed to load session');
        setSession(null);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    } else {
      setSession(null);
    }
  }, [sessionId]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'assistant':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'system':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        Select a session to view its details
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        Loading session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        Session not found or failed to load
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex justify-between items-start">
            <div>
              <h3 className="text-lg text-gray-900 dark:text-white">
                {session.prompt.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Session started: {new Date(session.startedAt).toLocaleString()}
                {session.endedAt && (
                  <span className="ml-2">
                    • Ended: {new Date(session.endedAt).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded ${
              session.endedAt 
                ? 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300'
            }`}>
              {session.endedAt ? 'Completed' : 'Active'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded">
            <h4 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Prompt:</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">{session.prompt.body}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Messages ({session.messages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.messages.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No messages in this session yet
            </p>
          ) : (
            <div className="space-y-4">
              {session.messages.map(message => (
                <div key={message.id} className="border-l-4 border-gray-200 dark:border-slate-600 pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${getRoleColor(message.role)}`}>
                      {message.role}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(message.timestamp)}
                    </span>
                    {message.latencyMs && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({message.latencyMs}ms)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}