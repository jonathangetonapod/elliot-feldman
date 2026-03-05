"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBisonData } from "@/lib/use-bison-data";
import { generateMockEmails, getMockDomainHealth } from "@/lib/mock-data";
import { generateAlerts, getAlertCounts, getSeverityIcon, getSeverityClasses, Alert, AlertSeverity } from "@/lib/alerts";

type FilterType = 'all' | AlertSeverity;

export default function AlertsPage() {
  const { emails: bisonEmails, domains: bisonDomains, connected, error, loading } = useBisonData();
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || loading;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  const domains = useMockData ? getMockDomainHealth() : bisonDomains;
  
  // Generate alerts
  const allAlerts = useMemo(() => generateAlerts(emails, domains), [emails, domains]);
  
  // Track dismissed/resolved alerts in local state
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>('all');
  
  // Load dismissed state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('elliot-feldman-dismissed-alerts');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setDismissedIds(new Set(parsed.dismissed || []));
          setResolvedIds(new Set(parsed.resolved || []));
        } catch (e) {
          // ignore
        }
      }
    }
  }, []);
  
  // Save to localStorage when state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('elliot-feldman-dismissed-alerts', JSON.stringify({
        dismissed: Array.from(dismissedIds),
        resolved: Array.from(resolvedIds),
      }));
    }
  }, [dismissedIds, resolvedIds]);
  
  // Filter out dismissed alerts and apply resolved status
  const visibleAlerts = useMemo(() => {
    return allAlerts
      .filter(a => !dismissedIds.has(a.id))
      .map(a => ({ ...a, resolved: resolvedIds.has(a.id) }));
  }, [allAlerts, dismissedIds, resolvedIds]);
  
  // Apply severity filter
  const filteredAlerts = useMemo(() => {
    if (filter === 'all') return visibleAlerts;
    return visibleAlerts.filter(a => a.severity === filter);
  }, [visibleAlerts, filter]);
  
  const counts = getAlertCounts(visibleAlerts);
  
  const handleDismiss = (alertId: string) => {
    setDismissedIds(prev => new Set([...prev, alertId]));
  };
  
  const handleResolve = (alertId: string) => {
    setResolvedIds(prev => new Set([...prev, alertId]));
  };
  
  const handleUnresolve = (alertId: string) => {
    setResolvedIds(prev => {
      const next = new Set(prev);
      next.delete(alertId);
      return next;
    });
  };
  
  const handleClearAll = () => {
    setDismissedIds(new Set());
    setResolvedIds(new Set());
  };
  
  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
              🔔 Alerts
            </h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">Account health alerts and notifications</p>
          </div>
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {loading ? (
              <Badge variant="outline" className="text-xs">
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5 animate-pulse"></span>
                Loading...
              </Badge>
            ) : connected && !error ? (
              <Badge variant="outline" className="text-xs border-green-200 text-green-700">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                Live Data
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700">
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5"></span>
                Demo Mode
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        <Card 
          className={`cursor-pointer transition-all ${filter === 'all' ? 'ring-2 ring-gray-400' : ''}`}
          onClick={() => setFilter('all')}
        >
          <CardContent className="p-3 lg:p-4">
            <div className="text-xs lg:text-sm text-gray-500">All Alerts</div>
            <div className="text-xl lg:text-2xl font-bold text-gray-900">{counts.total}</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'critical' ? 'ring-2 ring-red-400' : ''}`}
          onClick={() => setFilter('critical')}
        >
          <CardContent className="p-3 lg:p-4">
            <div className="text-xs lg:text-sm text-red-600 flex items-center gap-1">
              🔴 Critical
            </div>
            <div className="text-xl lg:text-2xl font-bold text-red-700">{counts.critical}</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'warning' ? 'ring-2 ring-yellow-400' : ''}`}
          onClick={() => setFilter('warning')}
        >
          <CardContent className="p-3 lg:p-4">
            <div className="text-xs lg:text-sm text-yellow-600 flex items-center gap-1">
              🟡 Warnings
            </div>
            <div className="text-xl lg:text-2xl font-bold text-yellow-700">{counts.warning}</div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'info' ? 'ring-2 ring-green-400' : ''}`}
          onClick={() => setFilter('info')}
        >
          <CardContent className="p-3 lg:p-4">
            <div className="text-xs lg:text-sm text-green-600 flex items-center gap-1">
              🟢 Info
            </div>
            <div className="text-xl lg:text-2xl font-bold text-green-700">{counts.info}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Alerts List */}
      <Card>
        <CardHeader className="px-4 lg:px-6 flex flex-row items-center justify-between">
          <CardTitle className="text-base lg:text-lg">
            {filter === 'all' ? 'All Alerts' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Alerts`}
          </CardTitle>
          {(dismissedIds.size > 0 || resolvedIds.size > 0) && (
            <Button variant="outline" size="sm" onClick={handleClearAll}>
              Reset All
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 lg:px-6 pb-4 lg:pb-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">✅</div>
              <div className="font-medium">No alerts</div>
              <div className="text-sm">
                {filter === 'all' ? 'All accounts are healthy!' : `No ${filter} alerts at this time.`}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => {
                const colors = getSeverityClasses(alert.severity);
                const isResolved = alert.resolved;
                
                return (
                  <div
                    key={alert.id}
                    className={`p-3 lg:p-4 rounded-lg border transition-all ${
                      isResolved 
                        ? 'bg-gray-50 border-gray-200 opacity-60' 
                        : `${colors.bg} ${colors.border}`
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header Row */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getSeverityIcon(alert.severity)}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${isResolved ? 'border-gray-300 text-gray-500' : colors.text}`}
                          >
                            {alert.severity.toUpperCase()}
                          </Badge>
                          {isResolved && (
                            <Badge variant="outline" className="text-xs border-green-300 text-green-600">
                              Resolved
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400 ml-auto sm:ml-2">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                        
                        {/* Message */}
                        <div className={`font-medium text-sm lg:text-base ${isResolved ? 'text-gray-500' : 'text-gray-900'}`}>
                          {alert.message}
                        </div>
                        
                        {/* Entity */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {alert.entityType === 'email' ? '📧' : '🌐'}
                          </span>
                          <span className={`text-xs lg:text-sm font-mono truncate ${isResolved ? 'text-gray-400' : 'text-gray-600'}`}>
                            {alert.entity}
                          </span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-2 shrink-0">
                        {isResolved ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleUnresolve(alert.id)}
                            className="text-xs"
                          >
                            Unresolve
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleResolve(alert.id)}
                            className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                          >
                            ✓ Resolve
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDismiss(alert.id)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Alert Type Legend */}
      <Card className="mt-6">
        <CardHeader className="px-4 lg:px-6">
          <CardTitle className="text-sm lg:text-base text-gray-700">Alert Types</CardTitle>
        </CardHeader>
        <CardContent className="px-4 lg:px-6 pb-4 lg:pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span>🔴</span>
              <div>
                <div className="font-medium text-red-700">Critical: Reply rate &lt;0.5%</div>
                <div className="text-xs text-gray-500">Account needs immediate attention</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span>🔴</span>
              <div>
                <div className="font-medium text-red-700">Critical: Domain blacklisted</div>
                <div className="text-xs text-gray-500">Domain is on email blacklists</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span>🟡</span>
              <div>
                <div className="font-medium text-yellow-700">Warning: Reply rate &lt;1%</div>
                <div className="text-xs text-gray-500">Account performance declining</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span>🟡</span>
              <div>
                <div className="font-medium text-yellow-700">Warning: Rate declining</div>
                <div className="text-xs text-gray-500">Below average reply rate</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span>🟢</span>
              <div>
                <div className="font-medium text-green-700">Info: Warmup complete</div>
                <div className="text-xs text-gray-500">Ready to scale sending</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
