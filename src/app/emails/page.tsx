"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getEmails, type EmailStatus, type WarmupStatus } from "@/lib/mock-data";

export default function EmailsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmailStatus | "all">("all");
  const [warmupFilter, setWarmupFilter] = useState<WarmupStatus | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: emails, total, totalPages } = getEmails({
    page,
    pageSize,
    search,
    status: statusFilter,
    warmupStatus: warmupFilter,
    sortBy: "replyRate",
    sortOrder: "asc",
  });

  const getStatusBadge = (status: EmailStatus) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Healthy</Badge>;
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">Warning</Badge>;
      case "burned":
        return <Badge variant="destructive" className="text-xs">Burned</Badge>;
    }
  };

  const getWarmupBadge = (status: WarmupStatus, day: number) => {
    switch (status) {
      case "ready":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Ready</Badge>;
      case "warming":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">Day {day}/30</Badge>;
      case "paused":
        return <Badge variant="outline" className="text-xs">Paused</Badge>;
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Email Accounts</h1>
        <p className="text-gray-500 mt-1 text-sm lg:text-base">Monitor and manage {total.toLocaleString()} sender emails</p>
      </div>

      {/* Filters */}
      <Card className="mb-4 lg:mb-6">
        <CardContent className="pt-4 lg:pt-6 px-4 lg:px-6">
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as EmailStatus | "all");
                  setPage(1);
                }}
              >
                <option value="all">All Status</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="burned">Burned</option>
              </select>
              <select
                className="flex-1 lg:flex-none px-3 py-2 border rounded-md text-sm"
                value={warmupFilter}
                onChange={(e) => {
                  setWarmupFilter(e.target.value as WarmupStatus | "all");
                  setPage(1);
                }}
              >
                <option value="all">All Warmup</option>
                <option value="ready">Ready</option>
                <option value="warming">Warming</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {emails.map((email) => (
          <Card key={email.id} className="cursor-pointer hover:bg-gray-50">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{email.email}</div>
                  <div className="text-xs text-gray-500">{email.name}</div>
                </div>
                <div className="flex flex-col gap-1 items-end ml-2">
                  {getStatusBadge(email.status)}
                  {getWarmupBadge(email.warmupStatus, email.warmupDay)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t">
                <div>
                  <div className="text-gray-500">Reply Rate</div>
                  <div className={`font-medium ${
                    email.replyRate < 1 ? "text-red-600" :
                    email.replyRate < 2 ? "text-yellow-600" : "text-green-600"
                  }`}>
                    {email.replyRate}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Sent (7d)</div>
                  <div className="font-medium">{email.sentLast7Days}</div>
                </div>
                <div>
                  <div className="text-gray-500">Daily Limit</div>
                  <div className="font-medium">{email.dailyLimit}</div>
                </div>
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
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Email</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Domain</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Status</th>
                  <th className="text-left p-4 font-medium text-sm text-gray-600">Warmup</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Reply Rate</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Sent (7d)</th>
                  <th className="text-right p-4 font-medium text-sm text-gray-600">Daily Limit</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id} className="border-b cursor-pointer hover:bg-gray-50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{email.email}</div>
                        <div className="text-xs text-gray-500">{email.name}</div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{email.domain}</td>
                    <td className="p-4">{getStatusBadge(email.status)}</td>
                    <td className="p-4">{getWarmupBadge(email.warmupStatus, email.warmupDay)}</td>
                    <td className="p-4 text-right">
                      <span className={
                        email.replyRate < 1 ? "text-red-600 font-medium" :
                        email.replyRate < 2 ? "text-yellow-600" : "text-green-600"
                      }>
                        {email.replyRate}%
                      </span>
                    </td>
                    <td className="p-4 text-right text-gray-600">{email.sentLast7Days}</td>
                    <td className="p-4 text-right text-gray-600">{email.dailyLimit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
        <div className="text-xs lg:text-sm text-gray-500">
          Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total.toLocaleString()}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Prev
          </Button>
          <div className="flex items-center gap-1">
            {[...Array(Math.min(3, totalPages))].map((_, i) => {
              const pageNum = page <= 2 ? i + 1 : page + i - 1;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className="w-8 lg:w-10"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
