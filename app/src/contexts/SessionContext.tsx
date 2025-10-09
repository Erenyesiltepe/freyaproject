'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface Session {
  id: string;
  promptId: string;
  startedAt: string;
  endedAt?: string;
  metadata?: any;
  prompt: {
    title: string;
  };
  _count?: {
    messages: number;
  };
}

interface SessionContextType {
  sessions: Session[];
  selectedSessionId: string | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  refreshSessions: () => Promise<void>;
  selectSession: (sessionId: string | null) => void;
  createSession: (promptId: string, metadata?: any) => Promise<Session | null>;
  endSession: (sessionId: string) => Promise<void>;
  
  // Utility functions
  getActiveSession: () => Session | null;
  getSessionById: (sessionId: string) => Session | null;
  isSessionActive: (sessionId: string) => boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh sessions from API
  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sessions?limit=50');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      } else {
        throw new Error('Failed to fetch sessions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Select a session
  const selectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId);
  }, []);

  // Create a new session
  const createSession = useCallback(async (promptId: string, metadata: any = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, metadata }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSession = data.session;
        
        // Update sessions list immediately (optimistic update)
        setSessions(prev => {
          // Mark previous sessions as ended (optimistic)
          const updatedPrev = prev.map(session => 
            !session.endedAt ? { ...session, endedAt: new Date().toISOString() } : session
          );
          
          // Ensure _count field is present for new session
          const sessionWithCount = {
            ...newSession,
            _count: newSession._count || { messages: 0 }
          };
          
          return [sessionWithCount, ...updatedPrev];
        });
        
        // Refresh to get accurate data from server
        setTimeout(() => refreshSessions(), 100);
        
        return newSession;
      } else {
        throw new Error('Failed to create session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error creating session:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshSessions]);

  // End a session
  const endSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'end' }),
      });

      if (response.ok) {
        // Update session in local state immediately (optimistic update)
        setSessions(prev => prev.map(session => 
          session.id === sessionId 
            ? { ...session, endedAt: new Date().toISOString() }
            : session
        ));
        
        // Refresh to get accurate data from server
        setTimeout(() => refreshSessions(), 100);
      } else {
        throw new Error('Failed to end session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error ending session:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshSessions]);

  // Utility functions
  const getActiveSession = useCallback(() => {
    return sessions.find(session => !session.endedAt) || null;
  }, [sessions]);

  const getSessionById = useCallback((sessionId: string) => {
    return sessions.find(session => session.id === sessionId) || null;
  }, [sessions]);

  const isSessionActive = useCallback((sessionId: string) => {
    const session = getSessionById(sessionId);
    return session ? !session.endedAt : false;
  }, [getSessionById]);

  // Initial load
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const value: SessionContextType = {
    sessions,
    selectedSessionId,
    loading,
    error,
    refreshSessions,
    selectSession,
    createSession,
    endSession,
    getActiveSession,
    getSessionById,
    isSessionActive,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

export type { Session, SessionContextType };