'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useLiveKit, LiveKitMessage } from '../lib/livekit';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessage = useRef<string | null>(null);
  const messageStartTime = useRef<number>(0);

  const livekit = useLiveKit();

  // Function to check session status
  const checkSessionStatus = async () => {
    if (!sessionId) {
      setSessionStatus('unknown');
      return;
    }
    
    try {
      const response = await fetch(`/api/sessions`);
      if (response.ok) {
        const data = await response.json();
        const session = data.sessions.find((s: any) => s.id === sessionId);
        if (session) {
          setSessionStatus(session.endedAt ? 'completed' : 'active');
        } else {
          setSessionStatus('unknown');
        }
      }
    } catch (error) {
      console.error('Error checking session status:', error);
      setSessionStatus('unknown');
    }
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

      if (!response.ok) {
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
          tokens: msg.tokens ? JSON.parse(msg.tokens) : undefined
        }));
        
        setMessages(prev => [...dbMessages, ...prev]);
      }
    } catch (error) {
      console.error('Error loading messages from database:', error);
    }
  };

  // Load messages when component mounts with sessionId
  useEffect(() => {
    if (sessionId) {
      loadMessagesFromDatabase();
      checkSessionStatus();
    }
  }, [sessionId]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle incoming LiveKit messages
  useEffect(() => {
    const removeHandler = livekit.addMessageHandler((message: LiveKitMessage) => {
      console.log('Received LiveKit message:', message);

      if (message.type === 'token_stream') {
        // Handle streaming tokens from agent
        if (message.tokens && message.tokens.length > 0) {
          const messageId = currentStreamingMessage.current || `agent-${Date.now()}`;
          
          // Record start time for latency calculation
          if (!currentStreamingMessage.current) {
            messageStartTime.current = Date.now();
            currentStreamingMessage.current = messageId;
          }

          setMessages(prev => {
            const existingIndex = prev.findIndex(m => m.id === messageId);
            const newContent = message.content || message.tokens?.join(' ') || '';
            
            if (existingIndex >= 0) {
              // Update existing streaming message
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: newContent,
                timestamp: message.timestamp,
                isStreaming: true
              };
              return updated;
            } else {
              // Create new streaming message
              return [...prev, {
                id: messageId,
                type: 'agent',
                content: newContent,
                timestamp: message.timestamp,
                isStreaming: true,
                tokens: message.tokens
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
            if (completedMessage && sessionId) {
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
          id: `user-${Date.now()}`,
          type: 'user',
          content: message.content,
          timestamp: message.timestamp
        }]);
      } else if (message.type === 'error') {
        // Handle error messages
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'system',
          content: `Error: ${message.content}`,
          timestamp: message.timestamp
        }]);
      }
    });

    return removeHandler;
  }, [livekit, userId]);

  const joinRoom = async () => {
    try {
      await livekit.connect({
        roomName,
        username,
        userId
      });
      
      setIsJoined(true);
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: `Connected to room: ${roomName}`,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Failed to join room:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'system',
        content: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const leaveRoom = async () => {
    try {
      await livekit.disconnect();
      setIsJoined(false);
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: 'Disconnected from room',
        timestamp: new Date().toISOString()
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
        id: `error-${Date.now()}`,
        type: 'system',
        content: 'Cannot send messages to a completed session. This session is read-only.',
        timestamp: new Date().toISOString()
      }]);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
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
        id: `error-${Date.now()}`,
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

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getConnectionStatus = () => {
    if (livekit.isConnecting) return 'Connecting...';
    if (livekit.isConnected) return 'Connected';
    if (livekit.error) return `Error: ${livekit.error}`;
    return 'Disconnected';
  };

  const getStatusColor = () => {
    if (livekit.isConnecting) return 'text-yellow-600';
    if (livekit.isConnected) return 'text-green-600';
    if (livekit.error) return 'text-red-600';
    return 'text-gray-600';
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
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 p-2 border rounded-lg bg-gray-50">
          {messages.map((message) => (
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
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
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
        </div>
      </CardContent>
    </Card>
  );
}