"use client";

import { useState } from "react";
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
  
  // Calculate daily capacity progression
  const getDailyCapacity = (day: number) => {
    if (day >= 30) return 50;
    if (day >= 20) return 35;
    if (day >= 10) return 20;
    if (day >= 5) return 10;
    return 5;
  };

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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Warmup Calendar</h1>
        <p className="text-gray-500 mt-1">Track email warmup progress and readiness</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.ready.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Ready for Use</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{stats.warming.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Currently Warming</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.readyThisWeek}</div>
            <div className="text-sm text-gray-500">Ready This Week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-400">{stats.paused}</div>
            <div className="text-sm text-gray-500">Paused</div>
          </CardContent>
        </Card>
      </div>

      {/* Warmup Progress Visualization */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>30-Day Warmup Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Day progression */}
            <div className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-500">Days 1-5</div>
              <div className="flex-1 h-8 bg-orange-100 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="text-sm font-medium text-orange-800">5 emails/day</span>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">
                {warmingEmails.filter(e => e.warmupDay <= 5).length} emails
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-500">Days 6-10</div>
              <div className="flex-1 h-8 bg-orange-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="text-sm font-medium text-orange-800">10 emails/day</span>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">
                {warmingEmails.filter(e => e.warmupDay > 5 && e.warmupDay <= 10).length} emails
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-500">Days 11-20</div>
              <div className="flex-1 h-8 bg-yellow-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="text-sm font-medium text-yellow-800">20 emails/day</span>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">
                {warmingEmails.filter(e => e.warmupDay > 10 && e.warmupDay <= 20).length} emails
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-500">Days 21-29</div>
              <div className="flex-1 h-8 bg-green-200 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="text-sm font-medium text-green-800">35 emails/day</span>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">
                {warmingEmails.filter(e => e.warmupDay > 20 && e.warmupDay < 30).length} emails
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-500">Day 30+</div>
              <div className="flex-1 h-8 bg-green-500 rounded-lg relative">
                <div className="absolute inset-0 flex items-center px-4">
                  <span className="text-sm font-medium text-white">50 emails/day (Ready!)</span>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-500 text-right">
                {readyEmails.length.toLocaleString()} emails
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Ready Dates */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Ready Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedDates.slice(0, 10).map(date => {
              const dateEmails = upcomingByDate[date];
              const formattedDate = new Date(date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });
              
              return (
                <div key={date} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{formattedDate}</div>
                    <div className="text-sm text-gray-500">
                      {dateEmails.length} emails will be ready
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-md justify-end">
                    {dateEmails.slice(0, 5).map(email => (
                      <Badge key={email.id} variant="outline" className="text-xs">
                        {email.domain}
                      </Badge>
                    ))}
                    {dateEmails.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{dateEmails.length - 5} more
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
