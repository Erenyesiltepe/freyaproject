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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessage = useRef<string | null>(null);

  const livekit = useLiveKit();

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
          currentStreamingMessage.current = messageId;

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
        // Mark streaming as complete
        if (currentStreamingMessage.current) {
          setMessages(prev => prev.map(m => 
            m.id === currentStreamingMessage.current 
              ? { ...m, isStreaming: false }
              : m
          ));
          currentStreamingMessage.current = null;
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
          <CardTitle>Live Chat with AI Agent</CardTitle>
          <div className="flex items-center gap-2">
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
              isJoined 
                ? "Type your message..." 
                : "Join room to start chatting"
            }
            disabled={!isJoined || livekit.isConnecting}
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <Button 
            onClick={sendMessage}
            disabled={!inputValue.trim() || !isJoined || livekit.isConnecting}
          >
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}