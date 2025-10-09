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
    messageId?: string;
    participantIdentity?: string;
    participantSid?: string;
    isAgent?: boolean;
    segmentId?: string;
    isFinal?: boolean;
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

      // Handle audio track subscriptions for agent speech
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('Track subscribed:', {
          kind: track.kind,
          source: publication.source,
          participant: participant.identity
        });

        if (track.kind === 'audio') {
          console.log(`Audio track from ${participant.identity} subscribed`);
          
          // Create audio element to play the agent's speech
          const audioElement = track.attach() as HTMLAudioElement;
          audioElement.autoplay = true;
          (audioElement as any).playsInline = true;
          
          // Apply speaker device if selected
          if ('setSinkId' in audioElement) {
            const selectedSpeaker = localStorage.getItem('selectedSpeaker');
            if (selectedSpeaker) {
              (audioElement as any).setSinkId(selectedSpeaker).catch(console.warn);
            }
          }
          
          // Add to document to ensure playback
          audioElement.style.display = 'none';
          document.body.appendChild(audioElement);
          
          console.log('Audio element created and configured for playback');
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log('Track unsubscribed:', {
          kind: track.kind,
          source: publication.source,
          participant: participant.identity
        });
        
        if (track.kind === 'audio') {
          // Clean up audio elements
          const audioElements = track.detach();
          audioElements.forEach(element => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
          });
          console.log('Audio elements cleaned up');
        }
      });

      // Auto-subscribe to all tracks (especially agent audio)
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        console.log('Track published:', {
          kind: publication.kind,
          source: publication.source,
          participant: participant.identity
        });
        
        // Auto-subscribe to agent audio tracks
        if (publication.kind === 'audio' && 
            (participant.identity.includes('agent') || 
             participant.identity.includes('Assistant'))) {
          console.log('Auto-subscribing to agent audio track');
          publication.setSubscribed(true);
        }
      });

      // Set up text stream handlers for transcriptions and chat
      room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
        try {
          const message = await reader.readAll();
          const attributes = reader.info?.attributes || {};
          const isFinal = attributes['lk.transcription_final'] === 'true';
          const isTranscription = attributes['lk.transcribed_track_id'] != null;
          const segmentId = attributes['lk.segment_id'];
          
          if (isTranscription) {
            console.log(`Transcription from ${participantInfo.identity} [final=${isFinal}, segment=${segmentId}]:`, message);
            
            const livekitMessage: LiveKitMessage = {
              type: isFinal ? 'token_stream' : 'token_stream',
              content: message,
              timestamp: new Date().toISOString(),
              metadata: {
                participantIdentity: participantInfo.identity,
                isAgent: participantInfo.identity?.includes('agent') || participantInfo.identity?.includes('Assistant') || false,
                segmentId,
                isFinal
              }
            };
            messageHandlers.current.forEach(handler => handler(livekitMessage));
            
            // Send completion signal for final transcriptions
            if (isFinal) {
              const completeMessage: LiveKitMessage = {
                type: 'stream_complete',
                content: '',
                timestamp: new Date().toISOString(),
                metadata: {
                  participantIdentity: participantInfo.identity,
                  segmentId
                }
              };
              messageHandlers.current.forEach(handler => handler(completeMessage));
            }
          } else {
            // Regular text message
            console.log(`Text message from ${participantInfo.identity}:`, message);
            const livekitMessage: LiveKitMessage = {
              type: 'token_stream',
              content: message,
              timestamp: new Date().toISOString(),
              metadata: {
                participantIdentity: participantInfo.identity,
                isAgent: participantInfo.identity?.includes('agent') || participantInfo.identity?.includes('Assistant') || false
              }
            };
            messageHandlers.current.forEach(handler => handler(livekitMessage));
            
            // Send completion signal
            const completeMessage: LiveKitMessage = {
              type: 'stream_complete',
              content: '',
              timestamp: new Date().toISOString(),
              metadata: {
                participantIdentity: participantInfo.identity
              }
            };
            messageHandlers.current.forEach(handler => handler(completeMessage));
          }
        } catch (error) {
          console.error('Error reading text stream:', error);
        }
      });

      // Set up chat stream handler for lk.chat topic
      room.registerTextStreamHandler('lk.chat', async (reader, participantInfo) => {
        try {
          const message = await reader.readAll();
          console.log(`Chat message from ${participantInfo.identity}:`, message);
          
          const livekitMessage: LiveKitMessage = {
            type: 'token_stream',
            content: message,
            timestamp: new Date().toISOString(),
            metadata: {
              participantIdentity: participantInfo.identity,
              isAgent: participantInfo.identity?.includes('agent') || participantInfo.identity?.includes('Assistant') || false
            }
          };
          messageHandlers.current.forEach(handler => handler(livekitMessage));
          
          // Send completion signal
          const completeMessage: LiveKitMessage = {
            type: 'stream_complete',
            content: '',
            timestamp: new Date().toISOString(),
            metadata: {
              participantIdentity: participantInfo.identity
            }
          };
          messageHandlers.current.forEach(handler => handler(completeMessage));
        } catch (error) {
          console.error('Error reading chat stream:', error);
        }
      });

      // Also listen for chat messages
      room.on(RoomEvent.ChatMessage, (message, participant) => {
        if (participant && participant !== room.localParticipant) {
          const livekitMessage: LiveKitMessage = {
            type: 'token_stream',
            content: message.message,
            timestamp: new Date().toISOString()
          };
          messageHandlers.current.forEach(handler => handler(livekitMessage));
          
          // Send completion signal
          const completeMessage: LiveKitMessage = {
            type: 'stream_complete',
            content: '',
            timestamp: new Date().toISOString()
          };
          messageHandlers.current.forEach(handler => handler(completeMessage));
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

    // For text messages, use the proper sendText method with 'lk.chat' topic
    if (message.type === 'user_message') {
      const messageText = message.content;
      
      // Send text message using the official sendText method with lk.chat topic
      await state.room.localParticipant.sendText(messageText, {
        topic: 'lk.chat'
      });
      
      console.log('Sent text message to room via lk.chat topic:', messageText);
    } else {
      // For other message types, use the original method
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(messageWithTimestamp));
      await state.room.localParticipant.publishData(data, { reliable: true });
      console.log('Sent message to room:', messageWithTimestamp);
    }
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