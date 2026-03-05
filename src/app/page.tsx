"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockDashboardStats, getMockDomainHealth, generateMockEmails } from "@/lib/mock-data";
import { useBisonData } from "@/lib/use-bison-data";

export default function Dashboard() {
  const { stats: bisonStats, emails: bisonEmails, domains: bisonDomains, loading, error, connected } = useBisonData();
  
  // Use real data if connected, otherwise fall back to mock
  const useMockData = !connected || error || !bisonStats;
  const stats = useMockData ? getMockDashboardStats() : bisonStats;
  const domains = useMockData ? getMockDomainHealth() : bisonDomains;
  const emails = useMockData ? generateMockEmails() : bisonEmails;
  
  // Get recent issues (burned + warning emails)
  const recentIssues = emails
    .filter(e => e.status !== 'healthy')
    .slice(0, 5);
  
  // Get flagged domains
  const flaggedDomains = domains
    .filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5)
    .slice(0, 5);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">Email infrastructure health overview</p>
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
