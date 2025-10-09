'use client';

import { create } from 'zustand';
import type { StateCreator } from 'zustand';

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

interface SessionStoreState {
  sessions: Session[];
  selectedSessionId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  refreshSessions: () => Promise<void>;
  selectSession: (sessionId: string | null) => void;
  createSession: (promptId: string, metadata?: any) => Promise<Session | null>;
  endSession: (sessionId: string) => Promise<void>;

  // Utility
  getActiveSession: () => Session | null;
  getSessionById: (sessionId: string) => Session | null;
  isSessionActive: (sessionId: string) => boolean;
}

// Create zustand store with same semantics as previous context
const createSessionStore: StateCreator<SessionStoreState> = (set, get) => ({
  sessions: [],
  selectedSessionId: null,
  loading: false,
  error: null,

  refreshSessions: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/sessions?limit=50');
      if (response.ok) {
        const data = await response.json();
        set({ sessions: data.sessions || [] });
      } else {
        throw new Error('Failed to fetch sessions');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      set({ error: errorMessage });
      console.error('Error loading sessions:', err);
    } finally {
      set({ loading: false });
    }
  },

  selectSession: (sessionId: string | null) => {
    set({ selectedSessionId: sessionId });
  },

  createSession: async (promptId: string, metadata: any = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId, metadata }),
      });

      if (response.ok) {
        const data = await response.json();
        const newSession: Session = data.session;

        set((state: SessionStoreState) => {
          const updatedPrev = state.sessions.map((session: Session) =>
            !session.endedAt ? { ...session, endedAt: new Date().toISOString() } : session
          );

          const sessionWithCount = {
            ...newSession,
            _count: newSession._count || { messages: 0 },
          };

          return { sessions: [sessionWithCount, ...updatedPrev] } as Partial<SessionStoreState>;
        });

        // Refresh to get accurate data from server
        setTimeout(() => get().refreshSessions(), 100);

        return newSession;
      } else {
        throw new Error('Failed to create session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      set({ error: errorMessage });
      console.error('Error creating session:', err);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  endSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'end' }),
      });

      if (response.ok) {
        set((state: SessionStoreState) => ({
          sessions: state.sessions.map((session: Session) =>
            session.id === sessionId ? { ...session, endedAt: new Date().toISOString() } : session
          ),
        }));

        // Refresh to get accurate data from server
        setTimeout(() => get().refreshSessions(), 100);
      } else {
        throw new Error('Failed to end session');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      set({ error: errorMessage });
      console.error('Error ending session:', err);
    } finally {
      set({ loading: false });
    }
  },

  getActiveSession: () => {
    const sessions = get().sessions;
    return sessions.find((s: Session) => !s.endedAt) || null;
  },

  getSessionById: (sessionId: string) => {
    const sessions = get().sessions;
    return sessions.find((s: Session) => s.id === sessionId) || null;
  },

  isSessionActive: (sessionId: string) => {
    const session = get().sessions.find((s: Session) => s.id === sessionId);
    return session ? !session.endedAt : false;
  },
});

export const useSessionStore = create<SessionStoreState>(createSessionStore);

// Keep the same named hook `useSession` to minimize required changes across the app.
export function useSession() {
  // Select full API object with shallow equality to avoid unnecessary re-renders
  // Return the full store API directly. Consumers can destructure the same
  // fields they used before when this was a Context.
  return useSessionStore();
}

export type { Session, SessionStoreState as SessionContextType };