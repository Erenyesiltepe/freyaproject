'use client';

import { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, DataPacket_Kind, RemoteParticipant } from 'livekit-client';

interface TestMessage {
  id: string;
  type: 'sent' | 'received' | 'error';
  content: string;
  timestamp: Date;
  topic?: string;
}

export default function AgentTest() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [testMessage, setTestMessage] = useState('Hello agent, can you hear me?');
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [agentConnected, setAgentConnected] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const addMessage = (type: TestMessage['type'], content: string, topic?: string) => {
    const message: TestMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
      topic
    };
    setMessages(prev => [...prev, message]);
  };

  const connectToRoom = async () => {
    try {
      const newRoom = new Room();
      roomRef.current = newRoom;

      // Set up event handlers BEFORE connecting
      newRoom.on(RoomEvent.Connected, () => {
        console.log('Connected to room');
        setConnected(true);
        addMessage('received', 'Connected to LiveKit room');
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        setConnected(false);
        setAgentConnected(false);
        addMessage('received', 'Disconnected from room');
      });

      newRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('Participant connected:', participant.identity);
        addMessage('received', `Participant joined: ${participant.identity}`);
        
        // Check if this is the agent
        if (participant.identity.includes('agent') || participant.identity.includes('assistant')) {
          setAgentConnected(true);
          addMessage('received', `🤖 Agent connected: ${participant.identity}`);
        }
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log('Participant disconnected:', participant.identity);
        addMessage('received', `Participant left: ${participant.identity}`);
        
        if (participant.identity.includes('agent') || participant.identity.includes('assistant')) {
          setAgentConnected(false);
          addMessage('received', '🤖 Agent disconnected');
        }
      });

      newRoom.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string) => {
        try {
          const decoder = new TextDecoder();
          const message = decoder.decode(payload);
          console.log('Data received:', { message, topic, participant: participant?.identity });
          
          addMessage('received', `📨 Data from ${participant?.identity || 'unknown'}: ${message}`, topic);
        } catch (error) {
          console.error('Error decoding received data:', error);
          addMessage('error', `Failed to decode data: ${error}`);
        }
      });

      // Handle chat messages through DataReceived event
      newRoom.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind, topic?: string) => {
        if (topic === 'chat') {
          const decoder = new TextDecoder();
          const message = decoder.decode(payload);
          console.log('Chat message received:', message, participant?.identity);
          addMessage('received', `💬 Chat from ${participant?.identity || 'unknown'}: ${message}`);
        }
      });

      // Get connection token using the advanced endpoint with session support
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName: 'agent-test-room',
          identity: `tester-${Date.now()}`,
          sessionId: null // No session context needed for testing
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.statusText}`);
      }

      const { token } = await response.json();
      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
      
      // Connect to room
      await newRoom.connect(livekitUrl, token);
      setRoom(newRoom);
      
    } catch (error) {
      console.error('Failed to connect:', error);
      addMessage('error', `Connection failed: ${error}`);
    }
  };

  const sendTestMessage = async () => {
    if (!room || !connected) {
      addMessage('error', 'Not connected to room');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(testMessage);
      
      // Send as data packet with topic
      await room.localParticipant.publishData(data, {
        reliable: true,
        topic: 'user_text_message'
      });
      
      addMessage('sent', `📤 Sent data packet: "${testMessage}"`, 'user_text_message');
      console.log('Sent data packet:', testMessage);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      addMessage('error', `Failed to send: ${error}`);
    }
  };

  const sendChatMessage = async () => {
    if (!room || !connected) {
      addMessage('error', 'Not connected to room');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(testMessage);
      await room.localParticipant.publishData(data, { topic: 'chat', reliable: true });
      addMessage('sent', `💬 Sent chat message: "${testMessage}"`);
      console.log('Sent chat message:', testMessage);
    } catch (error) {
      console.error('Failed to send chat message:', error);
      addMessage('error', `Failed to send chat: ${error}`);
    }
  };

  const disconnect = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setRoom(null);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-4">LiveKit Agent Communication Test</h1>
        
        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className={`p-3 rounded-lg ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            <div className="font-semibold">Room Connection</div>
            <div>{connected ? '✅ Connected' : '❌ Disconnected'}</div>
          </div>
          <div className={`p-3 rounded-lg ${agentConnected ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
            <div className="font-semibold">Agent Status</div>
            <div>{agentConnected ? '🤖 Agent Connected' : '⏳ Waiting for Agent'}</div>
          </div>
        </div>

        {/* Connection Controls */}
        <div className="flex gap-3 mb-6">
          {!connected ? (
            <button
              onClick={connectToRoom}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Connect to Room
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Disconnect
            </button>
          )}
          <button
            onClick={clearMessages}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Clear Messages
          </button>
        </div>

        {/* Test Message Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Test Message:</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Enter test message"
            />
            <button
              onClick={sendTestMessage}
              disabled={!connected}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300"
            >
              Send Data Packet
            </button>
            <button
              onClick={sendChatMessage}
              disabled={!connected}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300"
            >
              Send Chat Message
            </button>
          </div>
        </div>
      </div>

      {/* Message Log */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Message Log</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-gray-500 italic">No messages yet...</div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${
                  msg.type === 'sent' 
                    ? 'bg-blue-50 border-l-4 border-blue-500' 
                    : msg.type === 'received'
                    ? 'bg-green-50 border-l-4 border-green-500'
                    : 'bg-red-50 border-l-4 border-red-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-mono text-sm">{msg.content}</div>
                  <div className="text-xs text-gray-500 ml-2">
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
                {msg.topic && (
                  <div className="text-xs text-gray-600 mt-1">Topic: {msg.topic}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">Test Instructions:</h3>
        <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-1">
          <li>Start your Python agent with: <code className="bg-yellow-200 px-1 rounded">uv run python src/agent.py dev</code></li>
          <li>Click "Connect to Room" to join the LiveKit room</li>
          <li>Wait for the agent to connect (you should see "🤖 Agent Connected")</li>
          <li>Type a test message and click "Send Data Packet" to test data channels</li>
          <li>Try "Send Chat Message" to test chat functionality</li>
          <li>Watch the message log for responses from the agent</li>
        </ol>
      </div>
    </div>
  );
}