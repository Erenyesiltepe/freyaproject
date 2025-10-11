import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  component: string;
}

interface MetricsData {
  avgFirstTokenLatency: number;
  avgTokensPerSecond: number;
  errorRate: number;
  totalMessages: number;
  totalErrors: number;
  periodStart: string;
  periodEnd: string;
  recentLogs: LogEntry[];
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, livekitData } = body;

    // Handle LiveKit metrics data if provided (no longer stored in database)
    if (livekitData && typeof livekitData === 'object') {
      logger.info('LiveKit metrics received (not stored)', { 
        sessionId,
        firstTokenLatency: livekitData.avg_first_token_latency_ms,
        tokensPerSecond: livekitData.avg_tokens_per_second,
        errorRate: livekitData.error_rate_24h_percent
      });

      return Response.json({ 
        success: true, 
        message: 'Metrics received (not stored)',
        livekitData: livekitData 
      });
    }

    return Response.json({ error: 'No LiveKit data provided' }, { status: 400 });

  } catch (error) {
    logger.error('Failed to process metrics', { error });
    return Response.json({ error: 'Failed to process metrics' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameters for time range
    const { searchParams } = new URL(request.url);
    const hoursBack = parseInt(searchParams.get('hours') || '24');
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursBack * 60 * 60 * 1000));

    // Since metrics are now handled directly by the agent and not stored in database,
    // return placeholder data. Real metrics are available through the live-chat component via RPC.
    const metricsData: MetricsData = {
      avgFirstTokenLatency: 0, // Placeholder - real metrics come from agent RPC
      avgTokensPerSecond: 0,   // Placeholder - real metrics come from agent RPC
      errorRate: 0,            // Placeholder - real metrics come from agent RPC
      totalMessages: 0,
      totalErrors: 0,
      periodStart: startTime.toISOString(),
      periodEnd: endTime.toISOString(),
      recentLogs: [{
        id: 'system-info',
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Metrics are now collected directly from the LiveKit agent. Connect to a room in the chat interface to see real-time metrics.',
        component: 'system'
      }],
    };

    logger.info('Metrics requested - returning placeholder data (real metrics available via agent RPC)', { hoursBack });

    return NextResponse.json({
      success: true,
      metrics: metricsData,
      note: 'Metrics are now handled directly by the LiveKit agent. Use the chat interface to view real-time agent performance.',
      rawMetricsCount: {
        firstTokenLatencies: 0,
        tokenRates: 0,
        errorRates: 0,
        totalMetrics: 0
      }
    });

  } catch (error) {
    logger.error('Error fetching metrics:', { error });
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
