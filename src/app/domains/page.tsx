"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMockDomainHealth } from "@/lib/mock-data";

export default function DomainsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "issues">("all");
  
  const allDomains = getMockDomainHealth();
  
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Domain Health</h1>
        <p className="text-gray-500 mt-1">Monitor domain reputation and authentication</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Domains</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.healthy}</div>
            <div className="text-sm text-gray-500">Healthy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.blacklisted}</div>
            <div className="text-sm text-gray-500">Blacklisted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.highSpam}</div>
            <div className="text-sm text-gray-500">High Spam Score</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search domains..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === "all" 
                    ? "bg-gray-900 text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setFilter("all")}
              >
                All ({allDomains.length})
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="text-center">Emails</TableHead>
                <TableHead className="text-center">Health</TableHead>
                <TableHead className="text-center">Spam Score</TableHead>
                <TableHead className="text-center">Blacklist</TableHead>
                <TableHead className="text-center">SPF</TableHead>
                <TableHead className="text-center">DKIM</TableHead>
                <TableHead className="text-center">DMARC</TableHead>
                <TableHead className="text-center">Inbox Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.domain} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <div className="font-medium">{domain.domain}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-sm">
                      <span className="text-green-600">{domain.healthyEmails}</span>
                      {domain.warningEmails > 0 && (
                        <span className="text-yellow-600"> / {domain.warningEmails}</span>
                      )}
                      {domain.burnedEmails > 0 && (
                        <span className="text-red-600"> / {domain.burnedEmails}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {domain.burnedEmails === 0 && domain.warningEmails === 0 ? (
                      <Badge className="bg-green-100 text-green-800">Healthy</Badge>
                    ) : domain.burnedEmails > 0 ? (
                      <Badge variant="destructive">Issues</Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={
                      domain.spamScore > 5 ? "text-red-600 font-medium" :
                      domain.spamScore > 3 ? "text-yellow-600" : "text-green-600"
                    }>
                      {domain.spamScore}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {domain.blacklistStatus === "clean" ? (
                      <Badge className="bg-green-100 text-green-800">Clean</Badge>
                    ) : (
                      <Badge variant="destructive">Listed ({domain.blacklistCount})</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {domain.spfValid ? "✅" : "❌"}
                  </TableCell>
                  <TableCell className="text-center">
                    {domain.dkimValid ? "✅" : "❌"}
                  </TableCell>
                  <TableCell className="text-center">
                    {domain.dmarcValid ? "✅" : "❌"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={
                      domain.inboxPlacementRate < 70 ? "text-red-600 font-medium" :
                      domain.inboxPlacementRate < 85 ? "text-yellow-600" : "text-green-600"
                    }>
                      {domain.inboxPlacementRate}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
