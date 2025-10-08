import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import WebSocket from 'ws';
import { logger } from './logger.js';

export interface AgentConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentIdentity: string;
}

export interface IncomingMessage {
  type: 'user_message' | 'session_start' | 'session_end';
  content: string;
  sessionId?: string;
  userId?: string;
  timestamp?: string;
}

export interface TokenStreamResponse {
  type: 'token_stream' | 'stream_complete' | 'error';
  tokens?: string[];
  content?: string;
  sessionId?: string;
  metadata?: {
    totalTokens?: number;
    latencyMs?: number;
    model?: string;
  };
}

type AgentStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class AgentService {
  private config: AgentConfig;
  private status: AgentStatus = 'disconnected';
  private isConnected = false;
  private currentRoomName: string | null = null;
  private roomService: RoomServiceClient;

  constructor(config: AgentConfig) {
    this.config = config;
    // Convert WebSocket URL to HTTP for the room service
    const httpUrl = config.url.replace('ws://', 'http://').replace('wss://', 'https://');
    this.roomService = new RoomServiceClient(httpUrl, config.apiKey, config.apiSecret);
    logger.info('Agent service created', { 
      url: config.url,
      identity: config.agentIdentity 
    });
  }

  async start(): Promise<void> {
    try {
      this.status = 'connecting';
      logger.info('Agent starting up', { 
        url: this.config.url,
        identity: this.config.agentIdentity 
      });

      // For a simple agent, we'll just mark as connected
      // In a real implementation, you'd establish a WebSocket connection here
      this.status = 'connected';
      this.isConnected = true;
      
      logger.info('Agent service started successfully');

    } catch (error) {
      this.status = 'error';
      logger.error('Failed to start agent', { 
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined
        },
        url: this.config.url
      });
      throw error;
    }
  }

  async joinRoom(roomName: string): Promise<void> {
    try {
      logger.info('Attempting to join room', { roomName, agentIdentity: this.config.agentIdentity });

      // Generate access token for the agent
      const token = await this.generateAccessToken(roomName);
      
      // Create or get room
      try {
        await this.roomService.createRoom({
          name: roomName,
          emptyTimeout: 300,
          maxParticipants: 100
        });
        logger.info('Room created', { roomName });
      } catch (error) {
        // Room might already exist, that's okay
        logger.debug('Room might already exist', { roomName, error });
      }
      
      this.isConnected = true;
      this.currentRoomName = roomName;
      
      logger.info('Successfully joined room', { 
        roomName, 
        agentIdentity: this.config.agentIdentity,
        token: token.substring(0, 20) + '...'
      });

    } catch (error) {
      logger.error('Failed to join room', { error, roomName });
      throw error;
    }
  }

  private async generateAccessToken(roomName: string): Promise<string> {
    const token = new AccessToken(
      this.config.apiKey,
      this.config.apiSecret,
      {
        identity: this.config.agentIdentity,
        name: 'AI Assistant Agent'
      }
    );

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomRecord: false,
      roomAdmin: false
    });

    return await token.toJwt();
  }

  async processUserMessage(message: IncomingMessage): Promise<void> {
    logger.info('Processing user message', { message });
    
    try {
      const response = await this.generateStreamedResponse(message.content);
      logger.info('Generated response', { 
        tokenCount: response.tokens.length,
        responseLength: response.fullResponse.length 
      });
    } catch (error) {
      logger.error('Failed to process message', { error, message });
    }
  }

  private async generateStreamedResponse(userMessage: string): Promise<{
    tokens: string[];
    fullResponse: string;
  }> {
    // Simulate AI response generation
    const responses = [
      "I understand your question about " + userMessage.slice(0, 20) + "...",
      "Let me help you with that.",
      "Based on your input, I can provide the following assistance:",
      "Here's what I think about your request:",
      "I'd be happy to help you understand this better."
    ];
    
    const selectedResponse = responses[Math.floor(Math.random() * responses.length)] || "I can help you with that.";
    const tokens = selectedResponse.split(' ');
    
    // Simulate streaming with delays
    let accumulatedResponse = '';
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      
      accumulatedResponse += (i > 0 ? ' ' : '') + token;
      await this.delay(100 + Math.random() * 200);
    }

    return {
      tokens,
      fullResponse: accumulatedResponse
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.status = 'disconnected';
    this.currentRoomName = null;
    logger.info('Agent disconnected');
  }

  getStatus() {
    return {
      status: this.status,
      isConnected: this.isConnected,
      currentRoom: this.currentRoomName,
      agentIdentity: this.config.agentIdentity
    };
  }
}