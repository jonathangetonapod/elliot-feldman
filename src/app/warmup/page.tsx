"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateMockEmails } from "@/lib/mock-data";

export default function WarmupPage() {
  const emails = generateMockEmails();
  
  // Group emails by warmup day
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

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Warmup Calendar</h1>
        <p className="text-gray-500 mt-1 text-sm lg:text-base">Track email warmup progress and readiness</p>
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
                      {dateEmails.length} emails will be ready
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
        </CardContent>
      </Card>
    </div>
  );
}
