"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function HealthCheck() {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const checkHealth = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health')
      setHealth(await res.json())
    } catch (err) {
      setHealth({ status: 'error', error: 'Failed to fetch' })
    }
    setLoading(false)
  }

  return (
    <Card className="w-80 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-900 dark:text-slate-100">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={checkHealth} disabled={loading} className="w-full">
          {loading ? 'Checking...' : 'Check Health'}
        </Button>
        {health && (
          <div className="text-sm space-y-1 text-slate-700 dark:text-slate-300">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={health.status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {health.status}
              </span>
            </div>
            {health.environment && (
              <div className="flex justify-between">
                <span>Environment:</span>
                <span className="text-slate-900 dark:text-slate-100">{health.environment}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}