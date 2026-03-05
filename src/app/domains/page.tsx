"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getMockDomainHealth, DomainHealth } from "@/lib/mock-data";

type DataMode = "live" | "demo";

export default function DomainsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [allDomains, setAllDomains] = useState<DomainHealth[]>([]);
  const [dataMode, setDataMode] = useState<DataMode>("demo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch domains from EmailGuard API or fall back to mock data
  const fetchDomains = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to fetch from EmailGuard API
      const response = await fetch('/api/emailguard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'blacklist-status',
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if we have valid data from EmailGuard
      if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
        // Transform EmailGuard data to our DomainHealth format
        const transformedDomains: DomainHealth[] = data.data.map((item: {
          domain: string;
          spf_valid?: boolean;
          dkim_valid?: boolean;
          dmarc_valid?: boolean;
          blacklisted?: boolean;
          blacklist_count?: number;
          spam_score?: number;
          inbox_placement_rate?: number;
          total_emails?: number;
          healthy_emails?: number;
          warning_emails?: number;
          burned_emails?: number;
        }) => ({
          domain: item.domain,
          totalEmails: item.total_emails || 0,
          healthyEmails: item.healthy_emails || 0,
          warningEmails: item.warning_emails || 0,
          burnedEmails: item.burned_emails || 0,
          spamScore: item.spam_score || 0,
          blacklistStatus: item.blacklisted ? 'listed' : 'clean',
          blacklistCount: item.blacklist_count || 0,
          spfValid: item.spf_valid ?? true,
          dkimValid: item.dkim_valid ?? true,
          dmarcValid: item.dmarc_valid ?? true,
          inboxPlacementRate: item.inbox_placement_rate || 95,
          lastCheckedAt: new Date().toISOString(),
        }));
        
        setAllDomains(transformedDomains);
        setDataMode("live");
      } else {
        // No data from API, fall back to mock
        throw new Error("No domain data from API");
      }
    } catch (err) {
      // Fall back to mock data
      console.log("Falling back to mock data:", err);
      setAllDomains(getMockDomainHealth());
      setDataMode("demo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);
  
  const domains = allDomains.filter(d => {
    if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter === "issues") {
      return d.blacklistStatus === "listed" || d.spamScore > 5 || !d.spfValid || !d.dkimValid || !d.dmarcValid;
    }
    return true;
  });

  const stats = {
    total: allDomains.length,
    healthy: allDomains.filter(d => d.blacklistStatus === "clean" && d.spamScore <= 5).length,
    blacklisted: allDomains.filter(d => d.blacklistStatus === "listed").length,
    highSpam: allDomains.filter(d => d.spamScore > 5).length,
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Domain Health</h1>
            {dataMode === "live" ? (
              <Badge className="bg-green-100 text-green-800">Live Data</Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-800">Demo Mode</Badge>
            )}
          </div>
          <p className="text-gray-500 mt-1 text-sm lg:text-base">
            Monitor domain reputation and authentication
            {dataMode === "demo" && (
              <span className="text-yellow-600 ml-2">(Configure EmailGuard API key in Settings for live data)</span>
            )}
          </p>
        </div>
        <Button 
          onClick={fetchDomains} 
          variant="outline" 
          size="sm"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <Card className="mb-4 bg-red-50 border-red-200">
          <CardContent className="pt-4 text-red-700 text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-6">
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold">{loading ? "—" : stats.total}</div>
            <div className="text-xs lg:text-sm text-gray-500">Total Domains</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-green-600">{loading ? "—" : stats.healthy}</div>
            <div className="text-xs lg:text-sm text-gray-500">Healthy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-red-600">{loading ? "—" : stats.blacklisted}</div>
            <div className="text-xs lg:text-sm text-gray-500">Blacklisted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-yellow-600">{loading ? "—" : stats.highSpam}</div>
            <div className="text-xs lg:text-sm text-gray-500">High Spam</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 lg:mb-6">
        <CardContent className="pt-4 lg:pt-6 px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search domains..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                className={`flex-1 sm:flex-none px-3 lg:px-4 py-2 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                  filter === "all" 
                    ? "bg-gray-900 text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setFilter("all")}
              >
                All ({allDomains.length})
              </button>
              <button
                className={`flex-1 sm:flex-none px-3 lg:px-4 py-2 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                  filter === "issues" 
                    ? "bg-red-600 text-white" 
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
                onClick={() => setFilter("issues")}
              >
                Issues Only
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Loading domain data...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="lg:hidden space-y-3">
            {domains.map((domain) => (
              <Card key={domain.domain} className="cursor-pointer hover:bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-medium">{domain.domain}</div>
                      <div className="text-xs text-gray-500">{domain.totalEmails} emails</div>
                    </div>
                    {domain.blacklistStatus === "clean" && domain.spamScore <= 5 ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">Healthy</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Issues</Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                    <div>
                      <div className="text-gray-500">Spam Score</div>
                      <div className={`font-medium ${
                        domain.spamScore > 5 ? "text-red-600" :
                        domain.spamScore > 3 ? "text-yellow-600" : "text-green-600"
                      }`}>
                        {domain.spamScore}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Inbox Rate</div>
                      <div className={`font-medium ${
                        domain.inboxPlacementRate < 70 ? "text-red-600" :
                        domain.inboxPlacementRate < 85 ? "text-yellow-600" : "text-green-600"
                      }`}>
                        {domain.inboxPlacementRate}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-3 border-t">
                    <div className="flex gap-3 text-xs">
                      <span>SPF {domain.spfValid ? "✅" : "❌"}</span>
                      <span>DKIM {domain.dkimValid ? "✅" : "❌"}</span>
                      <span>DMARC {domain.dmarcValid ? "✅" : "❌"}</span>
                    </div>
                    {domain.blacklistStatus === "listed" && (
                      <Badge variant="destructive" className="text-xs">Blacklisted</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-4 font-medium text-sm text-gray-600">Domain</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">Emails</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">Health</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">Spam Score</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">Blacklist</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">SPF</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">DKIM</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">DMARC</th>
                      <th className="text-center p-4 font-medium text-sm text-gray-600">Inbox Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((domain) => (
                      <tr key={domain.domain} className="border-b cursor-pointer hover:bg-gray-50">
                        <td className="p-4">
                          <div className="font-medium">{domain.domain}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-sm">
                            <span className="text-green-600">{domain.healthyEmails}</span>
                            {domain.warningEmails > 0 && (
                              <span className="text-yellow-600"> / {domain.warningEmails}</span>
                            )}
                            {domain.burnedEmails > 0 && (
                              <span className="text-red-600"> / {domain.burnedEmails}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {domain.burnedEmails === 0 && domain.warningEmails === 0 ? (
                            <Badge className="bg-green-100 text-green-800">Healthy</Badge>
                          ) : domain.burnedEmails > 0 ? (
                            <Badge variant="destructive">Issues</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className={
                            domain.spamScore > 5 ? "text-red-600 font-medium" :
                            domain.spamScore > 3 ? "text-yellow-600" : "text-green-600"
                          }>
                            {domain.spamScore}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {domain.blacklistStatus === "clean" ? (
                            <Badge className="bg-green-100 text-green-800">Clean</Badge>
                          ) : (
                            <Badge variant="destructive">Listed ({domain.blacklistCount})</Badge>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {domain.spfValid ? "✅" : "❌"}
                        </td>
                        <td className="p-4 text-center">
                          {domain.dkimValid ? "✅" : "❌"}
                        </td>
                        <td className="p-4 text-center">
                          {domain.dmarcValid ? "✅" : "❌"}
                        </td>
                        <td className="p-4 text-center">
                          <span className={
                            domain.inboxPlacementRate < 70 ? "text-red-600 font-medium" :
                            domain.inboxPlacementRate < 85 ? "text-yellow-600" : "text-green-600"
                          }>
                            {domain.inboxPlacementRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
