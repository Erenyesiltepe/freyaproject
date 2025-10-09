import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

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

export async function GET(request: NextRequest) {
  try {
    // For now, skip authentication check - you can add it back later with proper JWT setup
    // const cookieStore = await cookies();
    // const token = cookieStore.get('auth-token');

    // Get query parameters for time range
    const { searchParams } = new URL(request.url);
    const hoursBack = parseInt(searchParams.get('hours') || '24');
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursBack * 60 * 60 * 1000));

    // Query messages from the last specified hours
    const messages = await prisma.message.findMany({
      where: {
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
        role: 'assistant', // Only look at agent responses
      },
      select: {
        id: true,
        timestamp: true,
        latencyMs: true,
        tokens: true,
        content: true,
        session: {
          select: {
            id: true,
          }
        }
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Query errors from the same period (you might need to add an errors table)
    // For now, we'll count messages with high latency or missing data as errors
    const errorMessages = messages.filter((msg: any) => 
      !msg.latencyMs || 
      msg.latencyMs > 30000 || // More than 30 seconds considered an error
      !msg.tokens
    );

    // Calculate metrics
    const validMessages = messages.filter((msg: any) => 
      msg.latencyMs && 
      msg.latencyMs <= 30000 && 
      msg.tokens
    );

    let avgFirstTokenLatency = 0;
    let avgTokensPerSecond = 0;
    
    if (validMessages.length > 0) {
      // Calculate average first token latency (assuming first token comes quickly)
      const firstTokenLatencies = validMessages
        .filter((msg: any) => msg.latencyMs)
        .map((msg: any) => Math.min(msg.latencyMs! / 4, 5000)); // Estimate first token at 1/4 of total latency, max 5s
      
      avgFirstTokenLatency = firstTokenLatencies.reduce((sum: number, lat: number) => sum + lat, 0) / firstTokenLatencies.length;

      // Calculate average tokens per second
      const tokenRates = validMessages
        .filter((msg: any) => msg.latencyMs && msg.tokens)
        .map((msg: any) => {
          const tokens = JSON.parse(msg.tokens || '[]');
          const tokensCount = Array.isArray(tokens) ? tokens.length : (typeof tokens === 'string' ? tokens.split(' ').length : 50);
          const timeInSeconds = (msg.latencyMs! / 1000);
          return timeInSeconds > 0 ? tokensCount / timeInSeconds : 0;
        })
        .filter((rate: number) => rate > 0 && rate < 1000); // Filter out unrealistic rates

      avgTokensPerSecond = tokenRates.length > 0 
        ? tokenRates.reduce((sum: number, rate: number) => sum + rate, 0) / tokenRates.length 
        : 0;
    }

    const errorRate = messages.length > 0 
      ? (errorMessages.length / messages.length) * 100 
      : 0;

    // Create log entries from actual database messages only
    const recentLogs: LogEntry[] = messages.slice(0, 20).map((msg: any, index: number) => ({
      id: `msg-${msg.id}`,
      timestamp: msg.timestamp,
      level: (msg.latencyMs && msg.latencyMs > 10000) ? 'warn' as const : 
             (!msg.latencyMs || !msg.tokens) ? 'error' as const : 'info' as const,
      message: `Response: ${msg.content ? msg.content.substring(0, 80) : 'No content'}${msg.content && msg.content.length > 80 ? '...' : ''} ${msg.latencyMs ? `(${msg.latencyMs}ms)` : ''}`,
      component: 'agent'
    }));

    const metricsData: MetricsData = {
      avgFirstTokenLatency: Math.round(avgFirstTokenLatency),
      avgTokensPerSecond: Math.round(avgTokensPerSecond * 100) / 100, // Round to 2 decimal places
      errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
      totalMessages: messages.length,
      totalErrors: errorMessages.length,
      periodStart: startTime.toISOString(),
      periodEnd: endTime.toISOString(),
      recentLogs: recentLogs,
    };

    return NextResponse.json({
      success: true,
      metrics: metricsData,
    });

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}