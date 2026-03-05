"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmails, type EmailStatus, type WarmupStatus, type SenderEmail } from "@/lib/mock-data";

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
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Healthy</Badge>;
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Warning</Badge>;
      case "burned":
        return <Badge variant="destructive">Burned</Badge>;
    }
  };

  const getWarmupBadge = (status: WarmupStatus, day: number) => {
    switch (status) {
      case "ready":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>;
      case "warming":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Day {day}/30</Badge>;
      case "paused":
        return <Badge variant="outline">Paused</Badge>;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Email Accounts</h1>
        <p className="text-gray-500 mt-1">Monitor and manage {total.toLocaleString()} sender emails</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <Input
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="px-3 py-2 border rounded-md text-sm"
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
                className="px-3 py-2 border rounded-md text-sm"
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead className="text-right">Reply Rate</TableHead>
                <TableHead className="text-right">Sent (7d)</TableHead>
                <TableHead className="text-right">Daily Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TableRow key={email.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <div className="font-medium">{email.email}</div>
                      <div className="text-xs text-gray-500">{email.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{email.domain}</TableCell>
                  <TableCell>{getStatusBadge(email.status)}</TableCell>
                  <TableCell>{getWarmupBadge(email.warmupStatus, email.warmupDay)}</TableCell>
                  <TableCell className="text-right">
                    <span className={
                      email.replyRate < 1 ? "text-red-600 font-medium" :
                      email.replyRate < 2 ? "text-yellow-600" : "text-green-600"
                    }>
                      {email.replyRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-gray-600">{email.sentLast7Days}</TableCell>
                  <TableCell className="text-right text-gray-600">{email.dailyLimit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total.toLocaleString()}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = page <= 3 ? i + 1 : page + i - 2;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
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
