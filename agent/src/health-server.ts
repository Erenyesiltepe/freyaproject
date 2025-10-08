import express, { Request, Response } from 'express';
import { Server } from 'http';
import { AgentService } from './agent-service.js';
import { logger } from './logger.js';

export class HealthServer {
  private app: express.Application;
  private server: Server | null = null;
  private agentService: AgentService;

  constructor(agentService: AgentService, port: number = 4001) {
    this.app = express();
    this.agentService = agentService;
    
    this.setupRoutes();
    this.server = this.app.listen(port, () => {
      logger.info('Health server started', { port });
    });
  }

  private setupRoutes() {
    this.app.use(express.json());

    this.app.get('/health', (req: Request, res: Response) => {
      const status = this.agentService.getStatus();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        agent: status,
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    this.app.get('/health/detailed', (req: Request, res: Response) => {
      const status = this.agentService.getStatus();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        agent: status,
        uptime: process.uptime(),
        version: '1.0.0',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        environment: process.env.NODE_ENV || 'development'
      });
    });
  }

  async close() {
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => {
          logger.info('Health server stopped');
          resolve();
        });
      });
    }
  }
}