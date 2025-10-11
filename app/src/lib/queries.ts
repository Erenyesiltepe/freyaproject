import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface Session {
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


// Utility functions for session management
export function isSessionActive(sessionId: string, sessions: Session[]): boolean {
  const session = sessions.find(s => s.id === sessionId);
  return session ? !session.endedAt : false;
}

export function getActiveSession(sessions: Session[]): Session | null {
  return sessions.find(s => !s.endedAt) || null;
}

export function getSessionById(sessionId: string, sessions: Session[]): Session | null {
  return sessions.find(s => s.id === sessionId) || null;
}

// Query keys for consistent cache management
export const queryKeys = {
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  messages: (sessionId: string) => ['messages', sessionId] as const,
  prompts: ['prompts'] as const,
  prompt: (id: string) => ['prompts', id] as const,
  metrics: (hours?: number) => ['metrics', hours] as const,
  auth: ['auth'] as const,
};

// Sessions queries
export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => {
      const response = await fetch('/api/sessions');
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }
      return response.json();
    },
    enabled: !!sessionId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (promptId: string) => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate sessions cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'end' }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to end session');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate sessions cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

// Messages queries
export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.messages(sessionId),
    queryFn: async () => {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return response.json();
    },
    enabled: !!sessionId,
    staleTime: 1000 * 30, // 30 seconds for real-time feel
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCreateMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (messageData: {
      sessionId: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      tokens?: string[];
      latencyMs?: number;
    }) => {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save message');
      }
      
      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics() });
    },
  });
}

// Prompts queries
export function usePrompts() {
  return useQuery({
    queryKey: queryKeys.prompts,
    queryFn: async () => {
      const response = await fetch('/api/prompts');
      if (!response.ok) {
        throw new Error('Failed to fetch prompts');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes - prompts don't change often
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (promptData: {
      title: string;
      body: string;
      tags: string[];
    }) => {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create prompt');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prompts });
    },
  });
}

// Metrics queries
export function useMetrics(hours: number = 24, refetchIntervalMs: number = 120000) { // Default 2 minutes
  return useQuery({
    queryKey: queryKeys.metrics(hours),
    queryFn: async () => {
      const response = await fetch(`/api/metrics?hours=${hours}`);
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      return response.json();
    },
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: refetchIntervalMs, // Configurable auto-refetch interval
    refetchIntervalInBackground: false, // Don't refetch when tab is not active
  });
}

// Auth queries
export function useAuth() {
  return useQuery({
    queryKey: queryKeys.auth,
    queryFn: async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        throw new Error('Not authenticated');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: false, // Don't retry auth failures
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to logout');
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Clear all caches on logout
      queryClient.clear();
    },
  });
}