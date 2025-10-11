'use client';

import React, { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useMetrics } from '@/lib/queries';
import { Room } from 'livekit-client';

interface MetricsData {
  avgFirstTokenLatency: number;
  avgTokensPerSecond: number;
  errorRate: number;
  totalMessages: number;
  totalErrors: number;
  periodStart: string;
  periodEnd: string;
  recentLogs: LogEntry[];
  rawMetricsCount?: {
    firstTokenLatencies: number;
    tokenRates: number;
    errorRates: number;
    totalMetrics: number;
  };
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  component: string;
}

interface MetricsProps {
  sessionId?: string;
  refreshInterval?: number;
  livekitRoom?: Room | null;
  isConnected?: boolean;
}

export function Metrics({ sessionId, refreshInterval = 30000, livekitRoom, isConnected }: MetricsProps) { // Default 30 seconds
  const { 
    data: metricsResponse, 
    isLoading: loading, 
    error
  } = useMetrics(24, refreshInterval); // Pass custom refresh interval
  
  const metrics = metricsResponse?.metrics as MetricsData | undefined;

  // Real-time metrics state from agent
  const [realtimeMetrics, setRealtimeMetrics] = React.useState<{
    avg_first_token_latency_ms: number;
    avg_tokens_per_second: number;
    error_rate_24h_percent: number;
    timestamp: string;
    status: string;
  } | null>(null);

  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);

  // Request agent metrics directly from LiveKit agent
  const requestAgentMetrics = useCallback(async () => {
    if (!livekitRoom || !isConnected) {
      console.warn('Cannot request metrics: not connected to room. Room:', livekitRoom, 'Connected:', isConnected);
      return;
    }

    try {
      console.log('Requesting LiveKit agent metrics...', {
        roomName: livekitRoom.name,
        participants: livekitRoom.remoteParticipants.size,
        localParticipant: livekitRoom.localParticipant?.identity,
        remoteParticipants: Array.from(livekitRoom.remoteParticipants.values()).map(p => ({
          identity: p.identity,
          sid: p.sid,
          isAgent: p.identity.includes('agent') || p.identity.includes('Assistant')
        }))
      });

      // Check if there are any remote participants (agents) in the room
      if (livekitRoom.remoteParticipants.size === 0) {
        console.warn('No remote participants (agents) found in room. RPC will likely timeout.');
        return;
      }

      // Try to find an agent participant to target specifically
      const agentParticipant = Array.from(livekitRoom.remoteParticipants.values())
        .find(p => p.identity.includes('agent') || p.identity.includes('Assistant') || p.identity.includes('python'));
      
      const destinationIdentity = agentParticipant ? agentParticipant.identity : '';
      
      console.log('Targeting RPC to:', destinationIdentity || 'broadcast to all participants');

      // Request metrics from agent via RPC with explicit timeout
      const result = await Promise.race([
        livekitRoom.localParticipant.performRpc({
          destinationIdentity: destinationIdentity, // Target specific agent or broadcast
          method: 'get_agent_metrics',
          payload: 'request'
        }),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('RPC timeout after 5 seconds')), 5000)
        )
      ]) as string;

      console.log('LiveKit agent metrics received:', result);

      if (result) {
        const livekitMetricsData = JSON.parse(result);
        setRealtimeMetrics(livekitMetricsData);
        setLastUpdated(new Date().toISOString());
      }

    } catch (error) {
      console.error('Failed to request LiveKit agent metrics:', error);
      // Reset metrics on error to show disconnected state
      setRealtimeMetrics(null);
    }
  }, [livekitRoom, isConnected]);

  React.useEffect(() => {
    if (metricsResponse) {
      setLastUpdated(new Date().toISOString());
    }
  }, [metricsResponse]);

  // Automatically collect agent metrics every 10 seconds when connected
  React.useEffect(() => {
    if (!isConnected || !livekitRoom) {
      return;
    }

    console.log('Starting automatic real-time metrics collection every 10 seconds');

    // Try to collect metrics immediately when connected
    setTimeout(() => {
      if (isConnected && livekitRoom) {
        requestAgentMetrics();
      }
    }, 2000); // Wait 2 seconds for agent to fully connect

    const intervalId = setInterval(() => {
      if (isConnected && livekitRoom) {
        requestAgentMetrics();
      }
    }, 10000); // 10 seconds

    return () => {
      console.log('Stopping automatic metrics collection');
      clearInterval(intervalId);
    };
  }, [isConnected, livekitRoom, requestAgentMetrics]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  const getMetricStatusColor = (value: number, type: 'latency' | 'tokens' | 'error') => {
    switch (type) {
      case 'latency':
        return value < 500 ? 'text-green-400' : value < 1000 ? 'text-yellow-400' : 'text-red-400';
      case 'tokens':
        return value > 10 ? 'text-green-400' : value > 5 ? 'text-yellow-400' : 'text-red-400';
      case 'error':
        return value < 5 ? 'text-green-400' : value < 10 ? 'text-yellow-400' : 'text-red-400';
      default:
        return 'text-gray-300';
    }
  };

  const getMetricIcon = (type: 'latency' | 'tokens' | 'error') => {
    switch (type) {
      case 'latency': return '⚡';
      case 'tokens': return '📝';
      case 'error': return '🚨';
      default: return '📊';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Agent Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-gray-400">Loading metrics...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Agent Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-red-400">
              Error loading metrics: {error.message || 'Unknown error'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            LiveKit Agent Performance Metrics
            <div className="flex flex-col items-end gap-1 text-right">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs text-gray-400">
                  {isConnected ? 'Agent Connected' : 'Agent Disconnected'}
                </span>
              </div>
              <span className="text-xs text-gray-400">Auto-refresh: {Math.floor(refreshInterval / 1000)} seconds</span>
              <span className="text-xs text-gray-500">Last updated: {lastUpdated ? formatTimestamp(lastUpdated) : '—'}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Connection status notice */}
          {!isConnected || !livekitRoom ? (
            <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-yellow-400 text-xl">⚠️</div>
                <div>
                  <div className="text-yellow-300 font-medium mb-1">Agent Not Connected</div>
                  <div className="text-yellow-200 text-sm">
                    Join a chat room to connect to the LiveKit agent and see real-time metrics. 
                    Make sure the agent is running with: <code className="text-yellow-100 bg-yellow-900/30 px-1 rounded">uv run python src/agent.py console</code>
                  </div>
                </div>
              </div>
            </div>
          ) : realtimeMetrics ? (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-600/30 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-green-400 text-xl">✅</div>
                <div>
                  <div className="text-green-300 font-medium mb-1">Real-time Metrics Active</div>
                  <div className="text-green-200 text-sm">
                    Successfully connected to LiveKit agent. Metrics are being collected every 10 seconds.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-blue-400 text-xl">🔄</div>
                <div>
                  <div className="text-blue-300 font-medium mb-1">Connecting to Agent</div>
                  <div className="text-blue-200 text-sm">
                    Connected to room, attempting to collect metrics from the agent...
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl mb-2">{getMetricIcon('latency')}</div>
              <div className={`text-3xl font-bold ${getMetricStatusColor(realtimeMetrics?.avg_first_token_latency_ms || 0, 'latency')}`}>
                {realtimeMetrics?.avg_first_token_latency_ms?.toFixed(1) || '—'}ms
              </div>
              <div className="text-gray-400 text-sm">First Token Latency</div>
              <div className="text-xs text-gray-500 mt-1">
                Real-time from agent
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">{getMetricIcon('tokens')}</div>
              <div className={`text-3xl font-bold ${getMetricStatusColor(realtimeMetrics?.avg_tokens_per_second || 0, 'tokens')}`}>
                {realtimeMetrics?.avg_tokens_per_second?.toFixed(1) || '—'}
              </div>
              <div className="text-gray-400 text-sm">Tokens/Second</div>
              <div className="text-xs text-gray-500 mt-1">
                Real-time from agent
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">{getMetricIcon('error')}</div>
              <div className={`text-3xl font-bold ${getMetricStatusColor(realtimeMetrics?.error_rate_24h_percent || 0, 'error')}`}>
                {realtimeMetrics?.error_rate_24h_percent?.toFixed(1) || '—'}%
              </div>
              <div className="text-gray-400 text-sm">Error Rate (24h)</div>
              <div className="text-xs text-gray-500 mt-1">
                Real-time from agent
              </div>
            </div>
          </div>

          {/* Performance Indicators */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <div className="flex justify-between text-sm">
              <div className="text-gray-400">
                Period: {metrics?.periodStart ? new Date(metrics.periodStart).toLocaleString() : 'N/A'} - 
                {metrics?.periodEnd ? new Date(metrics.periodEnd).toLocaleString() : 'N/A'}
              </div>
              <div className="text-gray-400">
                Total Metrics: {metrics?.rawMetricsCount?.totalMetrics || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Agent Activity Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            🤖 Agent Activity Logs (Last 20)
            <div className="text-xs text-gray-400 font-normal">
               {Math.floor(refreshInterval / 1000)} seconds
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {metrics?.recentLogs && metrics.recentLogs.length > 0 ? (
              metrics.recentLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`text-sm p-3 rounded border transition-colors ${
                    log.component === 'agent' 
                      ? 'bg-blue-900/20 border-blue-700/50' 
                      : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`${getLogLevelColor(log.level)} font-mono text-xs font-bold`}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className={`text-xs px-2 py-1 rounded font-mono ${
                        log.component === 'agent' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-600 text-gray-200'
                      }`}>
                        {log.component === 'agent' ? '🤖 AGENT' : '📊 METRICS'}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  </div>
                  <div className="text-gray-200 leading-relaxed">
                    {log.message}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-8">
                <div className="text-2xl mb-2">📋</div>
                <div>No recent agent activity logs available</div>
                <div className="text-xs mt-1">Logs will appear as the agent processes requests</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
