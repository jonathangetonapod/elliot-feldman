"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockDashboardStats, getMockDomainHealth, generateMockEmails } from "@/lib/mock-data";
import { useBisonData } from "@/lib/use-bison-data";
import { useState, useEffect } from "react";

// Helper to format time ago
function formatTimeAgo(date: Date | null): string {
  if (!date) return "Never";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  
  return "Over a day ago";
}

// Helper to get reply rate color
function getReplyRateColor(rate: number): { bg: string; text: string; indicator: string } {
  if (rate >= 2.5) return { bg: "bg-green-100", text: "text-green-700", indicator: "bg-green-500" };
  if (rate >= 1.5) return { bg: "bg-yellow-100", text: "text-yellow-700", indicator: "bg-yellow-500" };
  return { bg: "bg-red-100", text: "text-red-700", indicator: "bg-red-500" };
}

// Trend indicator component
function TrendIndicator({ trend, value }: { trend: 'up' | 'down' | 'stable'; value?: string }) {
  const icons = {
    up: (
      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ),
    down: (
      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    ),
    stable: (
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    ),
  };
  
  return (
    <div className="flex items-center gap-1">
      {icons[trend]}
      {value && <span className={`text-xs ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>{value}</span>}
    </div>
  );
}

// Progress bar component
function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div 
        className={`h-full ${color} transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const { stats: bisonStats, emails: bisonEmails, domains: bisonDomains, loading, error, connected, lastFetched, refetch } = useBisonData();
  const [lastSyncDisplay, setLastSyncDisplay] = useState<string>("Loading...");
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || !bisonStats;
  const stats = useMockData ? getMockDashboardStats() : bisonStats;
  const domains = useMockData ? getMockDomainHealth() : bisonDomains;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  
  // Update last sync display every minute
  useEffect(() => {
    const updateSyncDisplay = () => {
      if (useMockData) {
        setLastSyncDisplay("Demo data");
      } else {
        setLastSyncDisplay(formatTimeAgo(lastFetched));
      }
    };
    
    updateSyncDisplay();
    const interval = setInterval(updateSyncDisplay, 60000);
    return () => clearInterval(interval);
  }, [lastFetched, useMockData]);
  
  // Get recent issues (burned + warning emails)
  const recentIssues = emails
    .filter(e => e.status !== 'healthy')
    .slice(0, 5);
  
  // Get flagged domains
  const flaggedDomains = domains
    .filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5)
    .slice(0, 5);
    
  // Calculate warmup completion percentage
  const warmupCompletion = stats.totalEmails > 0 
    ? Math.round((stats.readyEmails / stats.totalEmails) * 100) 
    : 0;
    
  // Accounts needing attention
  const accountsNeedingAttention = stats.warningEmails + stats.burnedEmails;
  
  // Reply rate color
  const replyRateColors = getReplyRateColor(stats.avgReplyRate);

  return (
    <div className="p-4 lg:p-8">
      {/* Header with Last Synced Indicator */}
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">Email infrastructure health overview</p>
          </div>
          {/* Connection Status + Last Synced */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Last synced: {lastSyncDisplay}</span>
              {!loading && connected && (
                <button 
                  onClick={() => refetch()}
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  Refresh
                </button>
              )}
            </div>
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
              <Badge variant="outline" className="text-xs border-yellow-200 text-yellow-700" title={error || 'API not configured'}>
                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1.5"></span>
                Demo Mode
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-1 lg:pb-2 px-3 lg:px-6 pt-3 lg:pt-6">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-20"></div>
              </CardHeader>
              <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-16 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-24"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Stats Grid - Show when not loading */}
      {!loading && (
        <>
          {/* Quick Stats Section */}
          <Card className="mb-6 lg:mb-8">
            <CardHeader className="pb-2 lg:pb-4 px-4 lg:px-6">
              <CardTitle className="text-base lg:text-lg flex items-center gap-2">
                <span>📊</span>
                Quick Stats
                <Badge variant="outline" className="ml-auto text-xs">Last 7 days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 lg:px-6 pb-4 lg:pb-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {/* Total Emails Sent */}
                <div className="p-3 lg:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs lg:text-sm text-gray-500">Emails Sent</span>
                    <TrendIndicator trend="up" value="+12%" />
                  </div>
                  <div className="text-xl lg:text-2xl font-bold text-gray-900">
                    {stats.totalSentLast7Days.toLocaleString()}
                  </div>
                </div>
                
                {/* Total Replies */}
                <div className="p-3 lg:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs lg:text-sm text-gray-500">Replies</span>
                    <TrendIndicator trend="up" value="+8%" />
                  </div>
                  <div className="text-xl lg:text-2xl font-bold text-gray-900">
                    {stats.totalRepliesLast7Days.toLocaleString()}
                  </div>
                </div>
                
                {/* Reply Rate */}
                <div className={`p-3 lg:p-4 rounded-lg ${replyRateColors.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs lg:text-sm ${replyRateColors.text}`}>Reply Rate</span>
                    <TrendIndicator trend="stable" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${replyRateColors.indicator}`}></div>
                    <span className={`text-xl lg:text-2xl font-bold ${replyRateColors.text}`}>
                      {stats.avgReplyRate}%
                    </span>
                  </div>
                </div>
                
                {/* Accounts Needing Attention */}
                <div className={`p-3 lg:p-4 rounded-lg ${accountsNeedingAttention > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs lg:text-sm ${accountsNeedingAttention > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Need Attention
                    </span>
                    {accountsNeedingAttention > 0 && <TrendIndicator trend="down" />}
                  </div>
                  <div className={`text-xl lg:text-2xl font-bold ${accountsNeedingAttention > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {accountsNeedingAttention}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {stats.burnedEmails} burned + {stats.warningEmails} warning
                  </div>
                </div>
              </div>
              
              {/* Warmup Progress */}
              <div className="mt-4 lg:mt-6 p-3 lg:p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Warmup Completion</span>
                  <span className="text-sm font-bold text-gray-900">{warmupCompletion}%</span>
                </div>
                <ProgressBar 
                  value={stats.readyEmails} 
                  max={stats.totalEmails} 
                  color={warmupCompletion >= 80 ? "bg-green-500" : warmupCompletion >= 50 ? "bg-yellow-500" : "bg-orange-500"}
                />
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{stats.readyEmails} ready</span>
                  <span>{stats.warmingEmails} warming</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Original Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
            <Card>
              <CardHeader className="pb-1 lg:pb-2 px-3 lg:px-6 pt-3 lg:pt-6">
                <CardTitle className="text-xs lg:text-sm font-medium text-gray-500">Total Emails</CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
                <div className="text-xl lg:text-3xl font-bold">{stats.totalEmails.toLocaleString()}</div>
                <div className="flex gap-1 mt-1 lg:mt-2">
                  <Badge variant="default" className="bg-green-100 text-green-800 text-xs">{stats.healthyEmails} healthy</Badge>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-1 lg:pb-2 px-3 lg:px-6 pt-3 lg:pt-6">
                <CardTitle className="text-xs lg:text-sm font-medium text-gray-500">Health Status</CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
                <div className="space-y-1 lg:space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-gray-600">🟢 Healthy</span>
                    <span className="font-bold text-green-600 text-sm lg:text-base">{stats.healthyEmails}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-gray-600">🟡 Warning</span>
                    <span className="font-bold text-yellow-600 text-sm lg:text-base">{stats.warningEmails}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-gray-600">🔴 Burned</span>
                    <span className="font-bold text-red-600 text-sm lg:text-base">{stats.burnedEmails}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-1 lg:pb-2 px-3 lg:px-6 pt-3 lg:pt-6">
                <CardTitle className="text-xs lg:text-sm font-medium text-gray-500">Warmup Status</CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
                <div className="space-y-1 lg:space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-gray-600">✅ Ready</span>
                    <span className="font-bold text-green-600 text-sm lg:text-base">{stats.readyEmails}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-gray-600">🔥 Warming</span>
                    <span className="font-bold text-orange-600 text-sm lg:text-base">{stats.warmingEmails}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-1 lg:pb-2 px-3 lg:px-6 pt-3 lg:pt-6">
                <CardTitle className="text-xs lg:text-sm font-medium text-gray-500">Avg Reply Rate</CardTitle>
              </CardHeader>
              <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
                <div className="text-xl lg:text-3xl font-bold">{stats.avgReplyRate}%</div>
                <p className="text-xs lg:text-sm text-gray-500 mt-1">Last 7 days</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Domain Overview + Recent Issues */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
            <Card>
              <CardHeader className="px-4 lg:px-6">
                <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                  <span>Domain Overview</span>
                  <Badge variant="outline" className="text-xs">{stats.totalDomains} domains</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 lg:px-6">
                <div className="space-y-2 lg:space-y-3">
                  {flaggedDomains.length > 0 ? (
                    flaggedDomains.map(domain => (
                      <div key={domain.domain} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 lg:p-3 bg-red-50 rounded-lg border border-red-100 gap-2">
                        <div>
                          <div className="font-medium text-sm lg:text-base">{domain.domain}</div>
                          <div className="text-xs lg:text-sm text-gray-500">{domain.totalEmails} emails</div>
                        </div>
                        <div className="flex gap-1 lg:gap-2 flex-wrap">
                          {domain.blacklistStatus === 'listed' && (
                            <Badge variant="destructive" className="text-xs">Blacklisted ({domain.blacklistCount})</Badge>
                          )}
                          {domain.spamScore > 5 && (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-700 text-xs">
                              Spam: {domain.spamScore}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 lg:py-8 text-gray-500">
                      ✅ All domains healthy
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="px-4 lg:px-6">
                <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                  <span>Recent Issues</span>
                  <Badge variant="outline" className="border-red-200 text-red-700 text-xs">
                    {stats.warningEmails + stats.burnedEmails} total
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 lg:px-6">
                <div className="space-y-2 lg:space-y-3">
                  {recentIssues.length > 0 ? (
                    recentIssues.map(email => (
                      <div 
                        key={email.id} 
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 lg:p-3 rounded-lg border gap-2 ${
                          email.status === 'burned' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-xs lg:text-sm truncate">{email.email}</div>
                          <div className="text-xs text-gray-500">Reply rate: {email.replyRate}%</div>
                        </div>
                        <Badge variant={email.status === 'burned' ? 'destructive' : 'outline'} 
                          className={`text-xs shrink-0 ${email.status === 'warning' ? 'border-yellow-500 text-yellow-700' : ''}`}>
                          {email.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 lg:py-8 text-gray-500">
                      ✅ No issues found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Health Distribution Bar */}
          <Card>
            <CardHeader className="px-4 lg:px-6">
              <CardTitle className="text-base lg:text-lg">Email Health Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-4 lg:px-6">
              <div className="h-6 lg:h-8 rounded-full overflow-hidden flex">
                <div 
                  className="bg-green-500 transition-all" 
                  style={{ width: `${(stats.healthyEmails / stats.totalEmails) * 100}%` }}
                />
                <div 
                  className="bg-yellow-500 transition-all" 
                  style={{ width: `${(stats.warningEmails / stats.totalEmails) * 100}%` }}
                />
                <div 
                  className="bg-red-500 transition-all" 
                  style={{ width: `${(stats.burnedEmails / stats.totalEmails) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap justify-between mt-3 lg:mt-4 text-xs lg:text-sm gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-green-500 rounded-full"></div>
                  <span>Healthy ({((stats.healthyEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-yellow-500 rounded-full"></div>
                  <span>Warning ({((stats.warningEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 lg:w-3 lg:h-3 bg-red-500 rounded-full"></div>
                  <span>Burned ({((stats.burnedEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
