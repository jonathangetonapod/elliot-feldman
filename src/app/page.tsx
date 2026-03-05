"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMockDashboardStats, getMockDomainHealth, generateMockEmails } from "@/lib/mock-data";

export default function Dashboard() {
  const stats = getMockDashboardStats();
  const domains = getMockDomainHealth();
  const emails = generateMockEmails();
  
  // Get recent issues (burned + warning emails)
  const recentIssues = emails
    .filter(e => e.status !== 'healthy')
    .slice(0, 5);
  
  // Get flagged domains
  const flaggedDomains = domains
    .filter(d => d.blacklistStatus === 'listed' || d.spamScore > 5)
    .slice(0, 5);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Email infrastructure health overview</p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Emails</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalEmails.toLocaleString()}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="default" className="bg-green-100 text-green-800">{stats.healthyEmails} healthy</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Health Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">🟢 Healthy</span>
                <span className="font-bold text-green-600">{stats.healthyEmails}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">🟡 Warning</span>
                <span className="font-bold text-yellow-600">{stats.warningEmails}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">🔴 Burned</span>
                <span className="font-bold text-red-600">{stats.burnedEmails}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Warmup Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">✅ Ready</span>
                <span className="font-bold text-green-600">{stats.readyEmails}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">🔥 Warming</span>
                <span className="font-bold text-orange-600">{stats.warmingEmails}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Avg Reply Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgReplyRate}%</div>
            <p className="text-sm text-gray-500 mt-1">Last 7 days</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Domain Overview + Recent Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Domain Overview
              <Badge variant="outline">{stats.totalDomains} domains</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {flaggedDomains.length > 0 ? (
                flaggedDomains.map(domain => (
                  <div key={domain.domain} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                    <div>
                      <div className="font-medium">{domain.domain}</div>
                      <div className="text-sm text-gray-500">{domain.totalEmails} emails</div>
                    </div>
                    <div className="flex gap-2">
                      {domain.blacklistStatus === 'listed' && (
                        <Badge variant="destructive">Blacklisted ({domain.blacklistCount})</Badge>
                      )}
                      {domain.spamScore > 5 && (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                          Spam: {domain.spamScore}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  ✅ All domains healthy
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Issues
              <Badge variant="outline" className="border-red-200 text-red-700">
                {stats.warningEmails + stats.burnedEmails} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentIssues.map(email => (
                <div 
                  key={email.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    email.status === 'burned' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">{email.email}</div>
                    <div className="text-xs text-gray-500">Reply rate: {email.replyRate}%</div>
                  </div>
                  <Badge variant={email.status === 'burned' ? 'destructive' : 'outline'} 
                    className={email.status === 'warning' ? 'border-yellow-500 text-yellow-700' : ''}>
                    {email.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Health Distribution Bar */}
      <Card>
        <CardHeader>
          <CardTitle>Email Health Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 rounded-full overflow-hidden flex">
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
          <div className="flex justify-between mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Healthy ({((stats.healthyEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>Warning ({((stats.warningEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>Burned ({((stats.burnedEmails / stats.totalEmails) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
