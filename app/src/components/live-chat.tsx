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
  const [audioDevices, setAudioDevices] = useState<{ microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({ microphones: [], speakers: [] });
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessage = useRef<string | null>(null);
  const messageStartTime = useRef<number>(0);

  const livekit = useLiveKit();
  const { refreshSessions, isSessionActive } = useSession();

  // Generate unique IDs to prevent React key conflicts
  const generateUniqueId = (prefix: string = 'msg') => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Audio device management
  const enumerateAudioDevices = useCallback(async () => {
    try {
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');
      
      setAudioDevices({ microphones, speakers });
      
      // Set default devices if none selected
      if (!selectedMicrophone && microphones.length > 0) {
        setSelectedMicrophone(microphones[0].deviceId);
      }
      if (!selectedSpeaker && speakers.length > 0) {
        setSelectedSpeaker(speakers[0].deviceId);
      }
      
      console.log('Available microphones:', microphones);
      console.log('Available speakers:', speakers);
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
    }
  }, [selectedMicrophone, selectedSpeaker]);

  // Apply audio device settings
  const applyAudioDeviceSettings = useCallback(async () => {
    if (!livekit.room) return;
    
    try {
      // Apply speaker setting only (don't mess with microphone here)
      if (selectedSpeaker && 'setSinkId' in HTMLAudioElement.prototype) {
        // Get all audio elements in the page
        const audioElements = document.querySelectorAll('audio');
        for (const audio of audioElements) {
          try {
            await (audio as any).setSinkId(selectedSpeaker);
            console.log('Applied speaker device to audio element:', selectedSpeaker);
          } catch (error) {
            console.warn('Failed to set speaker for audio element:', error);
          }
        }
        
        // Set up a mutation observer to handle dynamically created audio elements
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                const audioElements = element.querySelectorAll ? element.querySelectorAll('audio') : [];
                
                // Also check if the node itself is an audio element
                if (element.tagName === 'AUDIO') {
                  (element as any).setSinkId?.(selectedSpeaker).catch(console.warn);
                }
                
                // Apply to any audio elements found within
                audioElements.forEach((audio) => {
                  (audio as any).setSinkId?.(selectedSpeaker).catch(console.warn);
                });
              }
            });
          });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Store the observer to clean it up later
        (window as any).__audioObserver = observer;
        
        console.log('Speaker device configured:', selectedSpeaker);
      }
    } catch (error) {
      console.error('Failed to apply audio device settings:', error);
    }
  }, [livekit.room, selectedSpeaker]);

  // Initialize audio devices on component mount
  useEffect(() => {
    enumerateAudioDevices();
    
    // Listen for device changes
    const handleDeviceChange = () => {
      enumerateAudioDevices();
    };
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateAudioDevices]);

  // Apply audio device settings when they change or when connected
  useEffect(() => {
    if (livekit.isConnected) {
      applyAudioDeviceSettings();
    }
    
    // Store selected speaker for LiveKit to use
    if (selectedSpeaker) {
      localStorage.setItem('selectedSpeaker', selectedSpeaker);
    }
  }, [livekit.isConnected, selectedSpeaker, applyAudioDeviceSettings]);

  // Test speaker function
  const testSpeaker = useCallback(async () => {
    try {
      // Create a short test tone
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Try to set the audio output to selected speaker if supported
      if (selectedSpeaker && 'setSinkId' in HTMLAudioElement.prototype) {
        try {
          const audio = new Audio();
          await (audio as any).setSinkId(selectedSpeaker);
          console.log('Test tone will play on selected speaker');
        } catch (error) {
          console.warn('Could not set speaker for test tone:', error);
        }
      }
      
      setTimeout(() => {
        audioContext.close();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to test speaker:', error);
      alert('Speaker test failed. Please check your audio permissions.');
    }
  }, [selectedSpeaker]);

  // Test microphone function
  const testMicrophone = useCallback(async () => {
    try {
      const constraints = selectedMicrophone 
        ? { audio: { deviceId: { exact: selectedMicrophone } } }
        : { audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Show that microphone is working
      setMessages(prev => [...prev, {
        id: generateUniqueId('system'),
        type: 'system',
        content: `🎤 Microphone test successful! Device: ${audioDevices.microphones.find(d => d.deviceId === selectedMicrophone)?.label || 'Default'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
      
      // Stop the stream after test
      stream.getTracks().forEach(track => track.stop());
      
    } catch (error) {
      console.error('Microphone test failed:', error);
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `❌ Microphone test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    }
  }, [selectedMicrophone, audioDevices.microphones]);

  // Test agent audio output
  const testAgentAudio = useCallback(async () => {
    if (!livekit.isConnected) {
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: '❌ Not connected to room. Join the room first.',
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
      return;
    }

    try {
      setMessages(prev => [...prev, {
        id: generateUniqueId('system'),
        type: 'system',
        content: '🔊 Testing agent audio output...',
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);

      // Call the test audio RPC method
      const result = await livekit.room?.localParticipant.performRpc({
        destinationIdentity: '', // Empty means broadcast to all participants
        method: 'test_audio_output',
        payload: 'test'
      });

      console.log('Audio test result:', result);
      
      setMessages(prev => [...prev, {
        id: generateUniqueId('system'),
        type: 'system',
        content: '✅ Audio test command sent. You should hear the agent speaking if audio is working properly.',
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);

    } catch (error) {
      console.error('Agent audio test failed:', error);
      setMessages(prev => [...prev, {
        id: generateUniqueId('error'),
        type: 'system',
        content: `❌ Agent audio test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        messageType: 'text'
      }]);
    }
  }, [livekit.isConnected, livekit.room]);
  
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
      
      // Phase 4a: Enable microphone using LiveKit SDK with selected device
      if (livekit.room && livekit.isConnected) {
        // Apply speaker settings first
        await applyAudioDeviceSettings();
        
        // Enable microphone with proper LiveKit method
        try {
          // If a specific microphone is selected, we'll handle it differently
          if (selectedMicrophone) {
            // First disable current microphone
            await livekit.room.localParticipant.setMicrophoneEnabled(false);
            
            // Create constraints for specific device
            const audioConstraints: MediaTrackConstraints = {
              deviceId: { exact: selectedMicrophone }
            };
            
            // Enable with constraints
            await livekit.room.localParticipant.setMicrophoneEnabled(true, audioConstraints);
            console.log('Microphone enabled with selected device:', selectedMicrophone);
          } else {
            // Use default microphone
            await livekit.room.localParticipant.setMicrophoneEnabled(true);
            console.log('Microphone enabled with default device');
          }
        } catch (micError) {
          console.warn('Failed to use selected microphone, trying default:', micError);
          // Fallback to default microphone
          await livekit.room.localParticipant.setMicrophoneEnabled(true);
        }
        
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
          content: `🎤 Voice call started. Speak to communicate.${selectedMicrophone ? ' Using selected microphone.' : ''}`,
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
        return 'text-yellow-400';
      case 'connected':
        return agentPresent ? 'text-green-400' : 'text-blue-400';
      case 'online':
        return 'text-green-400';
      case 'disconnected':
      default:
        if (livekit.error) return 'text-red-400';
        return 'text-gray-400';
    }
  };

  return (
    <Card className="w-full h-[600px] flex flex-col bg-gray-900 border-gray-700 text-gray-100">
      <CardHeader className="pb-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <CardTitle className="text-gray-100">
            Live Chat with AI Agent
            {sessionStatus === 'completed' && (
              <span className="text-sm font-normal text-gray-400 ml-2">(Read-only)</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {sessionStatus !== 'unknown' && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                sessionStatus === 'active' 
                  ? 'bg-green-900 text-green-300 border border-green-700' 
                  : 'bg-gray-800 text-gray-300 border border-gray-600'
              }`}>
                {sessionStatus === 'active' ? 'Active Session' : 'Completed Session'}
              </span>
            )}
            
            {/* Agent Presence Indicator */}
            {isJoined && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                agentPresent 
                  ? 'bg-blue-900 text-blue-300 border border-blue-700' 
                  : 'bg-orange-900 text-orange-300 border border-orange-700'
              }`}>
                {agentPresent ? '🤖 Agent Ready' : '⏳ Waiting for Agent'}
              </span>
            )}
            
            <span className={`text-sm ${getStatusColor()}`}>
              {getConnectionStatus()}
            </span>
            {livekit.participants.length > 0 && (
              <span className="text-sm text-gray-400">
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
              className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
            >
              {livekit.isConnecting ? 'Joining...' : 'Join Room'}
            </Button>
          ) : (
            <Button 
              onClick={leaveRoom} 
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-gray-200"
            >
              Leave Room
            </Button>
          )}
          
          {/* Audio Device Settings Button */}
          <Button
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            variant="outline"
            size="sm"
            title="Audio Device Settings"
            className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-gray-200"
          >
            🎧 Audio Settings
          </Button>
        </div>

        {/* Audio Device Settings Panel */}
        {showDeviceSettings && (
          <div className="mt-3 p-4 border border-gray-600 rounded-lg bg-gray-800 space-y-4 max-w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm text-gray-200">🎧 Audio Device Settings</h4>
              <button
                onClick={() => setShowDeviceSettings(false)}
                className="text-gray-400 hover:text-gray-200 text-lg leading-none"
                title="Close settings"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Microphone Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-300">
                  🎤 Microphone
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedMicrophone}
                    onChange={(e) => setSelectedMicrophone(e.target.value)}
                    className="flex-1 text-sm p-2 bg-gray-700 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-0"
                  >
                    <option value="" className="bg-gray-700">Select Microphone</option>
                    {audioDevices.microphones.map((device) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-gray-700">
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={testMicrophone}
                    className="px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
                    title="Test microphone"
                  >
                    🎤
                  </button>
                </div>
              </div>

              {/* Speaker Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-300">
                  🔊 Speaker/Headphones
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedSpeaker}
                    onChange={(e) => setSelectedSpeaker(e.target.value)}
                    className="flex-1 text-sm p-2 bg-gray-700 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-0"
                  >
                    <option value="" className="bg-gray-700">Select Speaker</option>
                    {audioDevices.speakers.map((device) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-gray-700">
                        {device.label || `Speaker ${device.deviceId.slice(0, 8)}...`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={testSpeaker}
                    disabled={!selectedSpeaker}
                    className="px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
                    title="Test speaker"
                  >
                    🔊
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-gray-600">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={enumerateAudioDevices}
                  className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-gray-700"
                >
                  � Refresh
                </button>
              </div>
              
              <button
                onClick={() => {
                  applyAudioDeviceSettings();
                  setShowDeviceSettings(false);
                }}
                className="text-xs bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Apply & Close
              </button>
            </div>

            {/* Device Status */}
            <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-gray-600">
              <div className="truncate">🎤 Mic: {audioDevices.microphones.find(d => d.deviceId === selectedMicrophone)?.label || 'None'}</div>
              <div className="truncate">🔊 Speaker: {audioDevices.speakers.find(d => d.deviceId === selectedSpeaker)?.label || 'None'}</div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 p-4 overflow-hidden bg-gray-900">
        {/* Messages - Phase 5: Unified Chat Log with chronological sorting */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3 border border-gray-700 rounded-lg bg-gray-800">
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
                    ? 'bg-blue-600 text-white'
                    : message.type === 'system'
                    ? 'bg-gray-700 text-gray-300 text-sm border border-gray-600'
                    : 'bg-gray-700 border border-gray-600 text-gray-200 shadow-sm'
                }`}
              >
                {/* Participant Identity Label (Phase 3 requirement) */}
                {message.type !== 'system' && (
                  <div className="text-xs text-gray-400 mb-1 font-medium">
                    {message.type === 'user' ? '👤 User' : '🤖 AI Agent'}
                  </div>
                )}
                
                {/* Phase 4b: Voice Transcript Indicator */}
                {message.messageType === 'voice_transcript' && (
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    <span>🎤</span>
                    <span>Voice Transcript</span>
                  </div>
                )}
                
                {/* Phase 5: Message Type Indicators */}
                {message.messageType === 'text' && message.type !== 'system' && (
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
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
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse border-red-600' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                : 'border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-gray-200'
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
                Start Call
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
                className={`flex-1 p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-700 disabled:text-gray-500 ${
                  sessionStatus === 'completed' ? 'cursor-not-allowed' : ''
                }`}
              />
              <Button 
                onClick={sendMessage}
                disabled={!inputValue.trim() || !isJoined || livekit.isConnecting || sessionStatus === 'completed'}
                title={sessionStatus === 'completed' ? 'Cannot send messages to completed session' : undefined}
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
              >
                Send
              </Button>
            </>
          ) : (
            /* Final Polish: Voice mode UI - hide text input, show voice status */
            <div className="flex-1 p-3 border border-blue-600 rounded-lg bg-blue-900/30 border-blue-600/50 flex items-center justify-center">
              <div className="text-center text-blue-300">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-2xl">🎤</span>
                  <span className="font-medium">Voice Call Active</span>
                </div>
                <div className="text-sm text-blue-400">
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