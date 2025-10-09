'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useLiveKit, LiveKitMessage } from '../lib/livekit';
import { useSession } from '@/contexts/SessionContext';

interface LiveChatProps {
  sessionId?: string;
  userId?: string;
  username?: string;
  roomName?: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  tokens?: string[];
  messageType?: 'text' | 'voice_transcript';
}

export function LiveChat({ 
  sessionId, 
  userId = 'user-' + Math.random().toString(36).substr(2, 9),
  username = 'User',
  roomName = 'agent-console-room'
}: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'active' | 'completed' | 'unknown'>('unknown');
  const [communicationMode, setCommunicationMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [agentPresent, setAgentPresent] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'online'>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessage = useRef<string | null>(null);
  const messageStartTime = useRef<number>(0);

  const livekit = useLiveKit();
  const { refreshSessions, isSessionActive } = useSession();

  // Generate unique IDs to prevent React key conflicts
  const generateUniqueId = (prefix: string = 'msg') => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };
  
  // Function to save messages to database
  const saveMessageToDatabase = async (messageData: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: string[];
    latencyMs?: number;
  }) => {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
      });

      if (response.ok) {
        // Trigger session refresh to update message counts
        refreshSessions();
      } else {
        console.error('Failed to save message to database');
      }
    } catch (error) {
      console.error('Error saving message to database:', error);
    }
  };

  // Function to load existing messages from database
  const loadMessagesFromDatabase = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        const dbMessages: ChatMessage[] = data.messages.map((msg: any) => ({
          id: msg.id,
          type: msg.role === 'assistant' ? 'agent' : msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          isStreaming: false,
          tokens: msg.tokens ? JSON.parse(msg.tokens) : undefined,
          messageType: msg.messageType || 'text'
        }));
        
        // Replace existing messages instead of appending to prevent duplicates
        setMessages(dbMessages);
      }
    } catch (error) {
      console.error('Error loading messages from database:', error);
    }
  };

  // Load messages when component mounts with sessionId
  useEffect(() => {
    if (sessionId) {
      loadMessagesFromDatabase();
      // Update session status from context
      setSessionStatus(isSessionActive(sessionId) ? 'active' : 'completed');
    }
  }, [sessionId, isSessionActive]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle incoming LiveKit messages with improved text streams support
  useEffect(() => {
    const removeHandler = livekit.addMessageHandler((message: LiveKitMessage) => {
      console.log('Received LiveKit message:', message);

      // Check if message is from AI agent based on participant identity
      const isFromAgent = message.metadata?.isAgent || 
                         message.metadata?.participantIdentity?.includes('agent') || 
                         message.metadata?.participantIdentity?.includes('Assistant') ||
                         false;

      if (message.type === 'token_stream') {
        // Handle both text messages and transcriptions
        const content = message.content;
        const isTranscription = message.metadata?.segmentId !== undefined;
        const isFinal = message.metadata?.isFinal !== false; // Default to true for non-transcription messages
        
        if (content && (isFinal || !isTranscription)) {
          // For final transcriptions or regular text messages, process normally
          const messageId = currentStreamingMessage.current || generateUniqueId(isFromAgent ? 'agent' : 'user');
          
          // Record start time for latency calculation
          if (!currentStreamingMessage.current) {
            messageStartTime.current = Date.now();
            currentStreamingMessage.current = messageId;
          }

          setMessages(prev => {
            const existingIndex = prev.findIndex(m => m.id === messageId);
            
            if (existingIndex >= 0) {
              // Update existing message with new content
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: content,
                timestamp: message.timestamp,
                isStreaming: !isFinal,
                messageType: isTranscription ? 'voice_transcript' : 'text'
              };
              return updated;
            } else {
              // Create new message
              return [...prev, {
                id: messageId,
                type: isFromAgent ? 'agent' : 'user',
                content: content,
                timestamp: message.timestamp,
                isStreaming: !isFinal,
                messageType: isTranscription ? 'voice_transcript' : 'text'
              }];
            }
          });
        }
      } else if (message.type === 'stream_complete') {
        // Mark streaming as complete and save to database
        if (currentStreamingMessage.current) {
          const latencyMs = Date.now() - messageStartTime.current;
          
          setMessages(prev => {
            const updated = prev.map(m => 
              m.id === currentStreamingMessage.current 
                ? { ...m, isStreaming: false }
                : m
            );
            
            // Get the completed message to save to database
            const completedMessage = updated.find(m => m.id === currentStreamingMessage.current);
            if (completedMessage && sessionId && completedMessage.type === 'agent') {
              saveMessageToDatabase({
                sessionId,
                role: 'assistant',
                content: completedMessage.content,
                tokens: completedMessage.tokens,
                latencyMs
              });
            }
            
            return updated;
          });
          
          currentStreamingMessage.current = null;
          messageStartTime.current = 0;
        }
      } else if (message.type === 'user_message' && message.userId !== userId) {
        // Handle messages from other users
        setMessages(prev => [...prev, {
          id: generateUniqueId('user'),
          type: 'user',
          content: message.content,
          timestamp: message.timestamp,
          messageType: 'text'
        }]);
      } else if (message.type === 'error') {
        // Handle error messages
        setMessages(prev => [...prev, {
          id: generateUniqueId('error'),
          type: 'system',
          content: `Error: ${message.content}`,
          timestamp: message.timestamp,
          messageType: 'text'
        }]);
      }
    });

    return removeHandler;
  }, [livekit, userId, sessionId]);

  // Phase 5: Sort messages chronologically for unified chat log
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  }, [messages]);
  useEffect(() => {
    // Update connection status based on LiveKit state
    if (livekit.isConnecting) {
      setConnectionStatus('connecting');
    } else if (livekit.isConnected) {
      setConnectionStatus('connected');
      // Check if agent is present
      const hasAgent = livekit.participants.some(p => 
        p.identity.includes('agent') || 
        p.identity.includes('Assistant') ||
        p.identity.includes('AI')
      );
      setAgentPresent(hasAgent);
      if (hasAgent) {
        setConnectionStatus('online');
      }
    } else {
      setConnectionStatus('disconnected');
      setAgentPresent(false);
    }
  }, [livekit.isConnecting, livekit.isConnected, livekit.participants]);

  const joinRoom = async () => {
    try {
      setConnectionStatus('connecting');
      
      await livekit.connect({
        roomName,
        username,
        userId
      });
      
      setIsJoined(true);
      setMessages(prev => [...prev, {
        id: generateUniqueId('system'),
        type: 'system',
        content: `Connected to room: ${roomName}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    } catch (error) {
      console.error('Failed to join room:', error);
      setConnectionStatus('disconnected');
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    }
  };

  const leaveRoom = async () => {
    try {
      await livekit.disconnect();
      setIsJoined(false);
      setConnectionStatus('disconnected');
      setAgentPresent(false);
      setMessages(prev => [...prev, {
        id: generateUniqueId('system'),
        type: 'system',
        content: 'Disconnected from room',
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    } catch (error) {
      console.error('Failed to leave room:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || !livekit.isConnected) return;

    // Check if session is read-only
    if (sessionStatus === 'completed') {
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: 'Cannot send messages to a completed session. This session is read-only.',
        timestamp: new Date().toISOString()
      }]);
      return;
    }

    const userMessage: ChatMessage = {
      id: generateUniqueId('user'),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    // Add user message to local state
    setMessages(prev => [...prev, userMessage]);

    try {
      // Send to agent via LiveKit data channel
      await livekit.sendMessage({
        type: 'user_message',
        content: inputValue,
        sessionId,
        userId
      });

      // Save user message to database if sessionId exists
      if (sessionId) {
        await saveMessageToDatabase({
          sessionId,
          role: 'user',
          content: inputValue
        });
      }

      setInputValue('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleCommunicationMode = async () => {
    if (communicationMode === 'text') {
      // Switch to voice mode - start call
      setCommunicationMode('voice');
      await startVoiceCall();
    } else {
      // Switch to text mode - end call
      setCommunicationMode('text');
      await endVoiceCall();
    }
  };

  const startVoiceCall = async () => {
    try {
      setIsRecording(true);
      
      // Phase 4a: Enable microphone using LiveKit SDK
      if (livekit.room && livekit.isConnected) {
        await livekit.room.localParticipant.setMicrophoneEnabled(true);
        
        // Tell the agent to switch to voice mode
        try {
          await livekit.room.localParticipant.performRpc({
            destinationIdentity: '', // Empty means broadcast to all participants
            method: 'toggle_communication_mode',
            payload: 'voice'
          });
          console.log('Agent switched to voice mode');
        } catch (rpcError) {
          console.warn('Failed to notify agent of voice mode:', rpcError);
        }
        
        // Add a system message to indicate voice mode is active
        setMessages(prev => [...prev, {
          id: generateUniqueId('system'),
          type: 'system',
          content: '🎤 Voice call started. Speak to communicate.',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        }]);
        
        console.log('Voice call started - microphone enabled');
      } else {
        throw new Error('Not connected to room');
      }
    } catch (error) {
      console.error('Failed to start voice call:', error);
      setIsRecording(false);
      setCommunicationMode('text');
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `Failed to start voice call: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    }
  };

  const endVoiceCall = async () => {
    try {
      setIsRecording(false);
      
      // Phase 4a: Disable microphone using LiveKit SDK
      if (livekit.room && livekit.isConnected) {
        await livekit.room.localParticipant.setMicrophoneEnabled(false);
        
        // Tell the agent to switch to text mode
        try {
          await livekit.room.localParticipant.performRpc({
            destinationIdentity: '', // Empty means broadcast to all participants
            method: 'toggle_communication_mode',
            payload: 'text'
          });
          console.log('Agent switched to text mode');
        } catch (rpcError) {
          console.warn('Failed to notify agent of text mode:', rpcError);
        }
        
        // Add a system message to indicate text mode is active
        setMessages(prev => [...prev, {
          id: generateUniqueId('system'),
          type: 'system',
          content: '💬 Voice call ended. Text mode activated.',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        }]);
        
        console.log('Voice call ended - microphone disabled');
      }
    } catch (error) {
      console.error('Failed to end voice call:', error);
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `Failed to end voice call: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return agentPresent ? 'Online (Agent Ready)' : 'Connected (Waiting for Agent)';
      case 'online':
        return 'Online (Agent Ready)';
      case 'disconnected':
      default:
        if (livekit.error) return `Error: ${livekit.error}`;
        return 'Disconnected';
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'text-yellow-600';
      case 'connected':
        return agentPresent ? 'text-green-600' : 'text-blue-600';
      case 'online':
        return 'text-green-600';
      case 'disconnected':
      default:
        if (livekit.error) return 'text-red-600';
        return 'text-gray-600';
    }
  };

  return (
    <Card className="w-full h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>
            Live Chat with AI Agent
            {sessionStatus === 'completed' && (
              <span className="text-sm font-normal text-gray-500 ml-2">(Read-only)</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {sessionStatus !== 'unknown' && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                sessionStatus === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {sessionStatus === 'active' ? 'Active Session' : 'Completed Session'}
              </span>
            )}
            
            {/* Agent Presence Indicator */}
            {isJoined && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                agentPresent 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {agentPresent ? '🤖 Agent Ready' : '⏳ Waiting for Agent'}
              </span>
            )}
            
            <span className={`text-sm ${getStatusColor()}`}>
              {getConnectionStatus()}
            </span>
            {livekit.participants.length > 0 && (
              <span className="text-sm text-gray-500">
                ({livekit.participants.length + 1} participants)
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!isJoined ? (
            <Button 
              onClick={joinRoom} 
              disabled={livekit.isConnecting}
              size="sm"
            >
              {livekit.isConnecting ? 'Joining...' : 'Join Room'}
            </Button>
          ) : (
            <Button 
              onClick={leaveRoom} 
              variant="outline"
              size="sm"
            >
              Leave Room
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
        {/* Messages - Phase 5: Unified Chat Log with chronological sorting */}
        <div className="flex-1 overflow-y-auto space-y-3 p-2 border rounded-lg bg-gray-50">
          {sortedMessages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-1 ${
                message.type === 'user' 
                  ? 'items-end' 
                  : message.type === 'system'
                  ? 'items-center'
                  : 'items-start'
              }`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : message.type === 'system'
                    ? 'bg-gray-200 text-gray-700 text-sm'
                    : 'bg-white border shadow-sm'
                }`}
              >
                {/* Participant Identity Label (Phase 3 requirement) */}
                {message.type !== 'system' && (
                  <div className="text-xs text-gray-500 mb-1 font-medium">
                    {message.type === 'user' ? '👤 User' : '🤖 AI Agent'}
                  </div>
                )}
                
                {/* Phase 4b: Voice Transcript Indicator */}
                {message.messageType === 'voice_transcript' && (
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <span>🎤</span>
                    <span>Voice Transcript</span>
                  </div>
                )}
                
                {/* Phase 5: Message Type Indicators */}
                {message.messageType === 'text' && message.type !== 'system' && (
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <span>💬</span>
                    <span>Text Message</span>
                  </div>
                )}
                
                <div className="whitespace-pre-wrap">
                  {message.content}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {formatTimestamp(message.timestamp)}
                {message.isStreaming && ' (streaming...)'}
                {message.messageType === 'voice_transcript' && ' (voice)'}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area with Final Polish: Hide/disable during voice calls */}
        <div className="flex gap-2">
          {/* Hybrid Control Button - Call/Mic Toggle */}
          <Button
            onClick={toggleCommunicationMode}
            disabled={!isJoined || livekit.isConnecting || sessionStatus === 'completed'}
            variant={communicationMode === 'voice' ? 'default' : 'outline'}
            size="sm"
            className={`px-3 ${
              communicationMode === 'voice' 
                ? isRecording 
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'border-gray-300'
            }`}
            title={
              communicationMode === 'voice' 
                ? 'End Call - Switch to Text Mode' 
                : 'Start Call - Switch to Voice Mode'
            }
          >
            {communicationMode === 'voice' ? (
              <span className="flex items-center gap-1">
                🎤 {isRecording ? 'End Call' : 'Voice Active'}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                � Start Call
              </span>
            )}
          </Button>

          {/* Final Polish: Conditionally render text input based on voice mode */}
          {communicationMode === 'text' ? (
            <>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  sessionStatus === 'completed'
                    ? "Session completed - read-only mode"
                    : isJoined 
                      ? "Type your message..." 
                      : "Join room to start chatting"
                }
                disabled={!isJoined || livekit.isConnecting || sessionStatus === 'completed'}
                className={`flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                  sessionStatus === 'completed' ? 'cursor-not-allowed' : ''
                }`}
              />
              <Button 
                onClick={sendMessage}
                disabled={!inputValue.trim() || !isJoined || livekit.isConnecting || sessionStatus === 'completed'}
                title={sessionStatus === 'completed' ? 'Cannot send messages to completed session' : undefined}
              >
                Send
              </Button>
            </>
          ) : (
            /* Final Polish: Voice mode UI - hide text input, show voice status */
            <div className="flex-1 p-3 border rounded-lg bg-blue-50 border-blue-200 flex items-center justify-center">
              <div className="text-center text-blue-700">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-2xl">🎤</span>
                  <span className="font-medium">Voice Call Active</span>
                </div>
                <div className="text-sm text-blue-600">
                  {isRecording ? 'Speak to communicate with the AI agent' : 'Preparing voice connection...'}
                </div>
                <div className="text-xs text-blue-500 mt-1">
                  Click "End Call" to return to text mode
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}