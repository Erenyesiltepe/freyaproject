import { config } from 'dotenv';
import { AgentService } from './agent-service.js';
import { HealthServer } from './health-server.js';
import { logger } from './logger.js';

// Load environment variables
config();

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || 'agent-console-room';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '4001');

async function main() {
  logger.info('Starting LiveKit Agent Service', {
    livekitUrl: LIVEKIT_URL,
    version: '1.0.0',
    defaultRoom: DEFAULT_ROOM,
    healthPort: HEALTH_PORT
  });

  const agentService = new AgentService({
    url: LIVEKIT_URL,
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    agentIdentity: 'ai-assistant-agent'
  });

  // Start the health server
  const healthServer = new HealthServer(agentService, HEALTH_PORT);

  // Handle graceful shutdown
  const cleanup = async () => {
    logger.info('Shutting down gracefully...');
    try {
      await healthServer.close();
      await agentService.disconnect();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Start the agent service
    await agentService.start();
    
    logger.info('Agent is ready and listening for messages', {
      status: agentService.getStatus()
    });

    // Keep the process alive
    setInterval(() => {
      const status = agentService.getStatus();
      logger.debug('Agent status', status);
    }, 30000); // Log status every 30 seconds

  } catch (error) {
    logger.error('Failed to start agent service', { error });
    process.exit(1);
  }
}

// Start the agent
main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});