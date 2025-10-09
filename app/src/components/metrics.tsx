'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useMetrics } from '@/lib/queries';

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
}

export function Metrics({ sessionId, refreshInterval = 10000 }: MetricsProps) {
  // Use TanStack Query for metrics data with auto-refresh
  const { 
    data: metricsResponse, 
    isLoading: loading, 
    error,
    refetch
  } = useMetrics(24);
  
  const metrics = metricsResponse?.metrics as MetricsData | undefined;

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'debug':
        return 'text-gray-400';
      default:
        return 'text-gray-300';
    }
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warn':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      case 'debug':
        return '🔍';
      default:
        return '📝';
    }
  };

  if (loading) {
    return (
      <Card className="w-full bg-gray-900 border-gray-700 text-gray-100">
        <CardHeader>
          <CardTitle className="text-white">Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-400">Loading metrics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full bg-gray-900 border-gray-700 text-gray-100">
        <CardHeader>
          <CardTitle className="text-white">Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-400 p-4 bg-red-900/20 rounded-lg">
            <div className="font-semibold">Error loading metrics</div>
            <div className="text-sm mt-1">{error?.message || 'Unknown error'}</div>
            <button 
              onClick={() => refetch()}
              className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Metrics Cards */}
      <Card className="w-full bg-gray-900 border-gray-700 text-gray-100">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <span>Performance Metrics</span>
            <span className="text-xs text-gray-400">
              Last 24h • Auto-refresh enabled
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* First Token Latency */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="text-2xl font-bold text-blue-400">
                {metrics?.avgFirstTokenLatency || 0}ms
              </div>
              <div className="text-sm text-gray-400">Avg First Token Latency</div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.totalMessages || 0} responses
              </div>
            </div>

            {/* Tokens per Second */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="text-2xl font-bold text-green-400">
                {metrics?.avgTokensPerSecond || 0}
              </div>
              <div className="text-sm text-gray-400">Avg Tokens/sec</div>
              <div className="text-xs text-gray-500 mt-1">
                Response speed
              </div>
            </div>

            {/* Error Rate */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className={`text-2xl font-bold ${
                (metrics?.errorRate || 0) > 5 ? 'text-red-400' : 
                (metrics?.errorRate || 0) > 1 ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {metrics?.errorRate || 0}%
              </div>
              <div className="text-sm text-gray-400">Error Rate</div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.totalErrors || 0} errors
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card className="w-full bg-gray-900 border-gray-700 text-gray-100">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity (Last 20 logs)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {metrics?.recentLogs && metrics.recentLogs.length > 0 ? (
              metrics.recentLogs.map((log) => (
                <div 
                  key={log.id}
                  className="flex items-start gap-3 p-2 bg-gray-800 rounded border border-gray-700 hover:bg-gray-750 transition-colors"
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">
                    {getLogLevelIcon(log.level)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                      <span className="font-medium text-gray-300">{log.component}</span>
                      <span>•</span>
                      <span>{formatTimestamp(log.timestamp)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        log.level === 'error' ? 'bg-red-900/50 text-red-300' :
                        log.level === 'warn' ? 'bg-yellow-900/50 text-yellow-300' :
                        log.level === 'info' ? 'bg-blue-900/50 text-blue-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-200 break-words">
                      {log.message}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📝</div>
                <div>No recent activity</div>
                <div className="text-xs mt-1">Activity will appear here as the agent processes messages</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}