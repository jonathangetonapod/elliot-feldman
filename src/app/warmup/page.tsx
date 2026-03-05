"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateMockEmails } from "@/lib/mock-data";

// Bison API sender type
interface BisonSender {
  id: number;
  email: string;
  warmup_enabled: boolean;
  warmup_limit: number;
  daily_limit: number;
  created_at: string;
  // Additional fields we might get
  first_name?: string;
  last_name?: string;
  reply_rate?: number;
}

// Processed email type for UI
interface WarmupEmail {
  id: number;
  email: string;
  domain: string;
  warmupStatus: "warming" | "ready" | "paused";
  warmupDay: number;
  warmupReadyDate: string;
  warmupLimit: number;
  dailyLimit: number;
}

// Calculate warmup day from created_at (days since creation, max 30)
function calculateWarmupDay(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffTime = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.min(Math.max(diffDays, 1), 30);
}

// Calculate ready date (30 days from creation)
function calculateReadyDate(createdAt: string): string {
  const created = new Date(createdAt);
  const readyDate = new Date(created);
  readyDate.setDate(readyDate.getDate() + 30);
  return readyDate.toISOString().split("T")[0];
}

// Transform Bison sender to our UI format
function transformSender(sender: BisonSender): WarmupEmail {
  const domain = sender.email.split("@")[1] || "unknown.com";
  const warmupDay = calculateWarmupDay(sender.created_at);
  
  // Determine warmup status
  let warmupStatus: "warming" | "ready" | "paused";
  if (!sender.warmup_enabled) {
    warmupStatus = "paused";
  } else if (warmupDay >= 30) {
    warmupStatus = "ready";
  } else {
    warmupStatus = "warming";
  }
  
  return {
    id: sender.id,
    email: sender.email,
    domain,
    warmupStatus,
    warmupDay,
    warmupReadyDate: calculateReadyDate(sender.created_at),
    warmupLimit: sender.warmup_limit,
    dailyLimit: sender.daily_limit,
  };
}

export default function WarmupPage() {
  const [emails, setEmails] = useState<WarmupEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // Get API key from localStorage
      let apiKey = "";
      try {
        const storedConfig = localStorage.getItem("elliot-feldman-config");
        if (storedConfig) {
          const config = JSON.parse(storedConfig);
          apiKey = config.bisonApiKey || "";
        }
      } catch {
        console.error("Failed to parse config from localStorage");
      }

      // If no API key, use mock data
      if (!apiKey) {
        console.log("No Bison API key found, using mock data");
        const mockEmails = generateMockEmails();
        setEmails(mockEmails.map(e => ({
          id: e.id,
          email: e.email,
          domain: e.domain,
          warmupStatus: e.warmupStatus,
          warmupDay: e.warmupDay,
          warmupReadyDate: e.warmupReadyDate,
          warmupLimit: e.warmupStatus === "warming" ? e.dailyLimit : 50,
          dailyLimit: 50,
        })));
        setUsingMockData(true);
        setLoading(false);
        return;
      }

      try {
        // Fetch sender emails from Bison API
        const response = await fetch("/api/bison?endpoint=senders", {
          headers: {
            "X-Bison-Api-Key": apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle response - could be array directly or wrapped in data property
        const senders: BisonSender[] = Array.isArray(data) ? data : (data.data || data.senders || []);
        
        if (senders.length === 0) {
          // No senders from API, fall back to mock
          console.log("No senders from API, using mock data");
          const mockEmails = generateMockEmails();
          setEmails(mockEmails.map(e => ({
            id: e.id,
            email: e.email,
            domain: e.domain,
            warmupStatus: e.warmupStatus,
            warmupDay: e.warmupDay,
            warmupReadyDate: e.warmupReadyDate,
            warmupLimit: e.warmupStatus === "warming" ? e.dailyLimit : 50,
            dailyLimit: 50,
          })));
          setUsingMockData(true);
        } else {
          // Transform API data
          const transformed = senders.map(transformSender);
          setEmails(transformed);
          setUsingMockData(false);
        }
      } catch (error) {
        console.error("Failed to fetch from Bison API:", error);
        // Fall back to mock data on error
        const mockEmails = generateMockEmails();
        setEmails(mockEmails.map(e => ({
          id: e.id,
          email: e.email,
          domain: e.domain,
          warmupStatus: e.warmupStatus,
          warmupDay: e.warmupDay,
          warmupReadyDate: e.warmupReadyDate,
          warmupLimit: e.warmupStatus === "warming" ? e.dailyLimit : 50,
          dailyLimit: 50,
        })));
        setUsingMockData(true);
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  // Group emails by warmup status
  const warmingEmails = emails.filter(e => e.warmupStatus === "warming");
  const readyEmails = emails.filter(e => e.warmupStatus === "ready");
  const pausedEmails = emails.filter(e => e.warmupStatus === "paused");
  
  // Group by ready date (next 30 days)
  const upcomingByDate: Record<string, typeof warmingEmails> = {};
  warmingEmails.forEach(email => {
    const date = email.warmupReadyDate;
    if (!upcomingByDate[date]) {
      upcomingByDate[date] = [];
    }
    upcomingByDate[date].push(email);
  });
  
  // Sort dates
  const sortedDates = Object.keys(upcomingByDate).sort();

  const stats = {
    warming: warmingEmails.length,
    ready: readyEmails.length,
    paused: pausedEmails.length,
    readyThisWeek: warmingEmails.filter(e => {
      const readyDate = new Date(e.warmupReadyDate);
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      return readyDate <= weekFromNow;
    }).length,
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Warmup Calendar</h1>
          <p className="text-gray-500 mt-1 text-sm lg:text-base">Track email warmup progress and readiness</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading warmup data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Warmup Calendar</h1>
            <p className="text-gray-500 mt-1 text-sm lg:text-base">Track email warmup progress and readiness</p>
          </div>
          {usingMockData && (
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
              Demo Data
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-6">
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-green-600">{stats.ready.toLocaleString()}</div>
            <div className="text-xs lg:text-sm text-gray-500">Ready for Use</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-orange-600">{stats.warming.toLocaleString()}</div>
            <div className="text-xs lg:text-sm text-gray-500">Warming</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-blue-600">{stats.readyThisWeek}</div>
            <div className="text-xs lg:text-sm text-gray-500">Ready This Week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-3 lg:pb-6">
            <div className="text-xl lg:text-2xl font-bold text-gray-400">{stats.paused}</div>
            <div className="text-xs lg:text-sm text-gray-500">Paused</div>
          </CardContent>
        </Card>
      </div>

      {/* Warmup Progress Visualization */}
      <Card className="mb-4 lg:mb-6">
        <CardHeader className="px-4 lg:px-6">
          <CardTitle className="text-base lg:text-lg">30-Day Warmup Schedule</CardTitle>
        </CardHeader>
        <CardContent className="px-4 lg:px-6">
          <div className="space-y-3 lg:space-y-4">
            {/* Day progression */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-full sm:w-20 text-xs lg:text-sm text-gray-500">Days 1-5</div>
              <div className="flex-1 h-6 lg:h-8 bg-orange-100 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-3 lg:px-4">
                  <span className="text-xs lg:text-sm font-medium text-orange-800">5 emails/day</span>
                </div>
              </div>
              <div className="w-full sm:w-16 text-xs lg:text-sm text-gray-500 sm:text-right">
                {warmingEmails.filter(e => e.warmupDay <= 5).length} emails
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-full sm:w-20 text-xs lg:text-sm text-gray-500">Days 6-10</div>
              <div className="flex-1 h-6 lg:h-8 bg-orange-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-3 lg:px-4">
                  <span className="text-xs lg:text-sm font-medium text-orange-800">10 emails/day</span>
                </div>
              </div>
              <div className="w-full sm:w-16 text-xs lg:text-sm text-gray-500 sm:text-right">
                {warmingEmails.filter(e => e.warmupDay > 5 && e.warmupDay <= 10).length} emails
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-full sm:w-20 text-xs lg:text-sm text-gray-500">Days 11-20</div>
              <div className="flex-1 h-6 lg:h-8 bg-yellow-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-3 lg:px-4">
                  <span className="text-xs lg:text-sm font-medium text-yellow-800">20 emails/day</span>
                </div>
              </div>
              <div className="w-full sm:w-16 text-xs lg:text-sm text-gray-500 sm:text-right">
                {warmingEmails.filter(e => e.warmupDay > 10 && e.warmupDay <= 20).length} emails
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-full sm:w-20 text-xs lg:text-sm text-gray-500">Days 21-29</div>
              <div className="flex-1 h-6 lg:h-8 bg-green-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-3 lg:px-4">
                  <span className="text-xs lg:text-sm font-medium text-green-800">35 emails/day</span>
                </div>
              </div>
              <div className="w-full sm:w-16 text-xs lg:text-sm text-gray-500 sm:text-right">
                {warmingEmails.filter(e => e.warmupDay > 20 && e.warmupDay < 30).length} emails
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-full sm:w-20 text-xs lg:text-sm text-gray-500">Day 30+</div>
              <div className="flex-1 h-6 lg:h-8 bg-green-500 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-3 lg:px-4">
                  <span className="text-xs lg:text-sm font-medium text-white">50 emails/day (Ready!)</span>
                </div>
              </div>
              <div className="w-full sm:w-16 text-xs lg:text-sm text-gray-500 sm:text-right">
                {readyEmails.length.toLocaleString()} emails
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Ready Dates */}
      <Card>
        <CardHeader className="px-4 lg:px-6">
          <CardTitle className="text-base lg:text-lg">Upcoming Ready Dates</CardTitle>
        </CardHeader>
        <CardContent className="px-4 lg:px-6">
          {sortedDates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {readyEmails.length > 0 
                ? "All emails are warmed up and ready!" 
                : "No emails currently warming up"}
            </div>
          ) : (
            <div className="space-y-2 lg:space-y-3">
              {sortedDates.slice(0, 10).map(date => {
                const dateEmails = upcomingByDate[date];
                const formattedDate = new Date(date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                });
                
                return (
                  <div key={date} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 lg:p-4 bg-gray-50 rounded-lg gap-2">
                    <div>
                      <div className="font-medium text-sm lg:text-base">{formattedDate}</div>
                      <div className="text-xs lg:text-sm text-gray-500">
                        {dateEmails.length} email{dateEmails.length !== 1 ? 's' : ''} will be ready
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:max-w-xs lg:max-w-md sm:justify-end">
                      {dateEmails.slice(0, 3).map(email => (
                        <Badge key={email.id} variant="outline" className="text-xs">
                          {email.domain}
                        </Badge>
                      ))}
                      {dateEmails.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{dateEmails.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
