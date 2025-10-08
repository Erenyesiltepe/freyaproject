import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';
import { logger } from './logger.js';

export interface AgentConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentIdentity: string;
  defaultRoom?: string;
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
  content?: string;
  tokens?: string[];
  sessionId?: string;
  timestamp?: string;
  metadata?: {
    totalTokens?: number;
    latencyMs?: number;
    model?: string;
  };
}

type AgentStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface AgentState {
  status: AgentStatus;
  isConnected: boolean;
  roomName: string | null;
  queueLength: number;
  lastUpdated: string;
}

export class AgentService {
  private readonly config: AgentConfig;
  private status: AgentStatus = 'disconnected';
  private isConnected = false;
  private currentRoomName: string | null = null;
  private readonly roomService: RoomServiceClient;
  private messageQueue: IncomingMessage[] = [];
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
      defaultRoom: config.defaultRoom ?? 'agent-console-room'
    };

    const httpUrl = this.config.url
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');

    this.roomService = new RoomServiceClient(
      httpUrl,
      this.config.apiKey,
      this.config.apiSecret
    );

    logger.info('Agent service created', {
      url: this.config.url,
      identity: this.config.agentIdentity,
      defaultRoom: this.config.defaultRoom
    });
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    logger.info('Agent starting up', {
      url: this.config.url,
      identity: this.config.agentIdentity,
      defaultRoom: this.config.defaultRoom
    });

    try {
      const roomName = this.config.defaultRoom ?? 'agent-console-room';
      await this.ensureRoomExists(roomName);

      this.status = 'connected';
      this.isConnected = true;
      this.currentRoomName = roomName;

      this.startMessageProcessing();

      await this.broadcastMessage({
        type: 'token_stream',
        content: `${this.config.agentIdentity} is online. Ask me anything!`,
        timestamp: new Date().toISOString(),
        metadata: {
          model: 'simulated-ai'
        }
      });

      logger.info('Agent service started successfully', {
        roomName: this.currentRoomName
      });
    } catch (error) {
      this.status = 'error';
      logger.error('Failed to start agent', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: 'Unknown error' }
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.isConnected = false;
    this.status = 'disconnected';
    this.currentRoomName = null;
    this.messageQueue = [];

    logger.info('Agent disconnected');
  }

  getStatus(): AgentState {
    return {
      status: this.status,
      isConnected: this.isConnected,
      roomName: this.currentRoomName,
      queueLength: this.messageQueue.length,
      lastUpdated: new Date().toISOString()
    };
  }

  async receiveMessage(message: IncomingMessage): Promise<void> {
    logger.info('Received message for processing', { message });
    this.messageQueue.push(message);
  }

  private async ensureRoomExists(roomName: string): Promise<void> {
    try {
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 300,
        maxParticipants: 100
      });
      logger.info('Room created or already exists', { roomName });
    } catch (error) {
      if (this.isNetworkError(error)) {
        throw new Error(
          `Unable to reach LiveKit server at ${this.config.url}. ` +
          'Ensure the LiveKit server is running and accessible from the agent service.'
        );
      }

      logger.debug('Room creation result', {
        roomName,
        error: error instanceof Error ? error.message : 'unknown error'
      });
    }
  }

  private startMessageProcessing(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(() => {
      void this.processMessageQueue();
    }, 1000);

    logger.info('Message processing loop started');
  }

  private async processMessageQueue(): Promise<void> {
    if (!this.isConnected || !this.currentRoomName) {
      return;
    }

    const message = this.messageQueue.shift();
    if (!message) {
      return;
    }

    try {
      await this.handleIncomingMessage(message);
    } catch (error) {
      logger.error('Failed to handle message', {
        message,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: 'Unknown error' }
      });

      try {
        await this.broadcastMessage({
          type: 'error',
          content: 'Something went wrong processing your message.',
          ...(message.sessionId ? { sessionId: message.sessionId } : {}),
          timestamp: new Date().toISOString()
        });
      } catch (broadcastError) {
        logger.error('Failed to notify room about message failure', {
          message,
          error: broadcastError instanceof Error
            ? { name: broadcastError.name, message: broadcastError.message }
            : { message: 'Unknown error' }
        });
      }
    }
  }

  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'session_start':
        await this.broadcastMessage({
          type: 'token_stream',
          content: 'Welcome! I\'m ready to help.',
          ...(message.sessionId ? { sessionId: message.sessionId } : {}),
          timestamp: new Date().toISOString()
        });
        break;
      case 'session_end':
        await this.broadcastMessage({
          type: 'stream_complete',
          content: 'Session ended. Talk soon!',
          ...(message.sessionId ? { sessionId: message.sessionId } : {}),
          timestamp: new Date().toISOString()
        });
        break;
      case 'user_message':
        await this.generateStreamingResponse(message.content, message.sessionId);
        break;
      default:
        logger.warn('Received unsupported message type', { message });
    }
  }

  private async generateStreamingResponse(userMessage: string, sessionId?: string): Promise<void> {
    const responses = [
      `I hear you asking about "${userMessage.slice(0, 60)}${userMessage.length > 60 ? '…' : ''}".`,
      'Let me think through that with you.',
      'Here are a few things to consider:',
      'Hope this sheds some light on your question.'
    ];

    const selectedResponse =
      responses[Math.floor(Math.random() * responses.length)] ?? 'I can help you with that.';

    const tokens = selectedResponse.split(' ');
    let accumulated = '';

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token) continue;

      accumulated += (index > 0 ? ' ' : '') + token;

      await this.broadcastMessage({
        type: 'token_stream',
        tokens: [token],
        content: accumulated,
        ...(sessionId ? { sessionId } : {}),
        timestamp: new Date().toISOString(),
        metadata: {
          totalTokens: tokens.length,
          latencyMs: index * 150,
          model: 'simulated-ai'
        }
      });

      await this.delay(120 + Math.random() * 120);
    }

    await this.broadcastMessage({
      type: 'stream_complete',
      content: accumulated,
      ...(sessionId ? { sessionId } : {}),
      timestamp: new Date().toISOString(),
      metadata: {
        totalTokens: tokens.length,
        latencyMs: tokens.length * 150,
        model: 'simulated-ai'
      }
    });
  }

  private async broadcastMessage(message: TokenStreamResponse): Promise<void> {
    if (!this.currentRoomName) {
      logger.warn('Attempted to broadcast without active room', { message });
      return;
    }

    try {
      const payload = Buffer.from(
        JSON.stringify({
          ...message,
          sender: this.config.agentIdentity
        }),
        'utf8'
      );

      await this.roomService.sendData(
        this.currentRoomName,
        payload,
        DataPacket_Kind.RELIABLE,
        { topic: 'agent-response' }
      );

      logger.debug('Broadcasted LiveKit message', {
        room: this.currentRoomName,
        type: message.type,
        sessionId: message.sessionId
      });
    } catch (error) {
      const err = error instanceof Error
        ? error
        : new Error('Unknown error broadcasting LiveKit message');

      logger.error('Failed to broadcast LiveKit message', {
        message,
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      });

      if (this.isNetworkError(err)) {
        err.message = `Unable to reach LiveKit server at ${this.config.url}: ${err.message}`;
      }

      throw err;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes('fetch failed') || message.includes('connection refused') || message.includes('connect econnrefused')) {
      return true;
    }

    const errWithCode = error as NodeJS.ErrnoException & { cause?: { code?: string } };
    return errWithCode.code === 'ECONNREFUSED' || errWithCode.cause?.code === 'ECONNREFUSED';
  }
}