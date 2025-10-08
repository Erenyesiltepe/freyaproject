'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Room, RoomEvent, DataPacket_Kind, RemoteParticipant, ConnectionState } from 'livekit-client';
import { v4 as uuidv4 } from 'uuid';

export interface LiveKitMessage {
  type: 'user_message' | 'token_stream' | 'stream_complete' | 'error';
  content: string;
  timestamp: string;
  sessionId?: string;
  userId?: string;
  tokens?: string[];
  metadata?: {
    totalTokens?: number;
    latencyMs?: number;
    model?: string;
  };
}

export interface LiveKitConnectionOptions {
  roomName: string;
  username: string;
  userId?: string;
}

export interface LiveKitConnectionState {
  room: Room | null;
  isConnected: boolean;
  isConnecting: boolean;
  participants: RemoteParticipant[];
  error: string | null;
  connectionState: ConnectionState;
}

export function useLiveKit() {
  const [state, setState] = useState<LiveKitConnectionState>({
    room: null,
    isConnected: false,
    isConnecting: false,
    participants: [],
    error: null,
    connectionState: ConnectionState.Disconnected,
  });

  const messageHandlers = useRef<((message: LiveKitMessage) => void)[]>([]);
  const roomRef = useRef<Room | null>(null);

  const addMessageHandler = useCallback((handler: (message: LiveKitMessage) => void) => {
    messageHandlers.current.push(handler);
    return () => {
      messageHandlers.current = messageHandlers.current.filter(h => h !== handler);
    };
  }, []);

  const connect = useCallback(async (options: LiveKitConnectionOptions) => {
    if (state.isConnecting || state.isConnected) {
      console.warn('Already connecting or connected');
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!livekitUrl) {
      const errorMessage = 'LiveKit URL not configured. Set NEXT_PUBLIC_LIVEKIT_URL in your environment.';
      console.error(errorMessage);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
      return;
    }

    try {
      // Generate unique identity per session to avoid conflicts
      const uniqueIdentity = `${options.username}-${uuidv4()}`;
      
      // Get access token from our API
      const tokenResponse = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: options.roomName,
          identity: uniqueIdentity,
          userId: options.userId,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to get token: ${tokenResponse.statusText}`);
      }

      const { token } = await tokenResponse.json();

      // Create room instance
      const room = new Room();
      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.Connected, () => {
        console.log('Connected to LiveKit room');
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          connectionState: ConnectionState.Connected,
        }));
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('Disconnected from LiveKit room:', reason);
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          connectionState: ConnectionState.Disconnected,
          participants: [],
        }));
      });

      room.on(RoomEvent.ConnectionStateChanged, (connectionState) => {
        setState(prev => ({ ...prev, connectionState }));
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant connected:', participant.identity);
        setState(prev => ({
          ...prev,
          participants: [...prev.participants, participant],
        }));
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('Participant disconnected:', participant.identity);
        setState(prev => ({
          ...prev,
          participants: prev.participants.filter(p => p.sid !== participant.sid),
        }));
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const decoder = new TextDecoder();
          const messageText = decoder.decode(payload);
          const message: LiveKitMessage = JSON.parse(messageText);
          
          console.log('Received data from agent:', message);
          
          // Notify all message handlers
          messageHandlers.current.forEach(handler => handler(message));
        } catch (error) {
          console.error('Failed to parse received data:', error);
        }
      });

      // Connect to the room
      await room.connect(livekitUrl, token);

      setState(prev => ({ ...prev, room }));

    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      let friendlyMessage = error instanceof Error ? error.message : 'Failed to connect';
      if (error instanceof Error) {
        const lower = error.message.toLowerCase();
        if (lower.includes('fetch failed') || lower.includes('connection refused') || lower.includes('networkerror')) {
          friendlyMessage = `Couldn't reach LiveKit server at ${livekitUrl}. Ensure the LiveKit server is running and accessible.`;
        }
      }

      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: friendlyMessage,
      }));
    }
  }, [state.isConnecting, state.isConnected]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    setState({
      room: null,
      isConnected: false,
      isConnecting: false,
      participants: [],
      error: null,
      connectionState: ConnectionState.Disconnected,
    });
  }, []);

  const sendMessage = useCallback(async (message: Omit<LiveKitMessage, 'timestamp'>) => {
    if (!state.room || !state.isConnected) {
      throw new Error('Not connected to room');
    }

    const messageWithTimestamp: LiveKitMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(messageWithTimestamp));

    // Send via data channel to all participants (including agent)
    await state.room.localParticipant.publishData(data, { reliable: true });
    
    console.log('Sent message to room:', messageWithTimestamp);
  }, [state.room, state.isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendMessage,
    addMessageHandler,
  };
}