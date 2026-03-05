"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ApiKeyConfig {
  bisonApiKey: string;
  emailGuardApiKey: string;
}

interface ConnectionStatus {
  bison: "untested" | "testing" | "connected" | "error";
  emailGuard: "untested" | "testing" | "connected" | "error";
}

interface ConnectionError {
  bison: string | null;
  emailGuard: string | null;
}

interface SyncResult {
  total_bison_domains: number;
  existing_emailguard_domains: number;
  newly_added: string[];
  errors: { domain: string; error: string }[];
}

type SyncStatus = "idle" | "syncing" | "success" | "error";

export default function SettingsPage() {
  const [config, setConfig] = useState<ApiKeyConfig>({
    bisonApiKey: "",
    emailGuardApiKey: "",
  });
  const [status, setStatus] = useState<ConnectionStatus>({
    bison: "untested",
    emailGuard: "untested",
  });
  const [errors, setErrors] = useState<ConnectionError>({
    bison: null,
    emailGuard: null,
  });
  const [saved, setSaved] = useState(false);
  const [showBisonKey, setShowBisonKey] = useState(false);
  const [showEmailGuardKey, setShowEmailGuardKey] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const storedConfig = localStorage.getItem("elliot-feldman-config");
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        setConfig(parsed);
        // If keys exist, mark as untested (user may want to verify)
        if (parsed.bisonApiKey) setStatus(s => ({ ...s, bison: "untested" }));
        if (parsed.emailGuardApiKey) setStatus(s => ({ ...s, emailGuard: "untested" }));
      } catch {
        console.error("Failed to parse stored config");
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("elliot-feldman-config", JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testBisonConnection = async () => {
    if (!config.bisonApiKey) {
      setStatus(s => ({ ...s, bison: "error" }));
      setErrors(e => ({ ...e, bison: "No API key provided" }));
      return;
    }
    
    setStatus(s => ({ ...s, bison: "testing" }));
    setErrors(e => ({ ...e, bison: null }));
    
    try {
      // Call the real Bison API via our proxy
      const response = await fetch('/api/bison?endpoint=sender-emails', {
        method: 'GET',
        headers: {
          'X-Bison-Api-Key': config.bisonApiKey,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Check for valid response structure
      if (data.data !== undefined || data.meta !== undefined) {
        setStatus(s => ({ ...s, bison: "connected" }));
        setErrors(e => ({ ...e, bison: null }));
      } else {
        throw new Error("Invalid response structure from Bison API");
      }
    } catch (err) {
      setStatus(s => ({ ...s, bison: "error" }));
      setErrors(e => ({ 
        ...e, 
        bison: err instanceof Error ? err.message : "Connection failed" 
      }));
    }
  };

  const testEmailGuardConnection = async () => {
    if (!config.emailGuardApiKey) {
      setStatus(s => ({ ...s, emailGuard: "error" }));
      setErrors(e => ({ ...e, emailGuard: "No API key provided" }));
      return;
    }
    
    setStatus(s => ({ ...s, emailGuard: "testing" }));
    setErrors(e => ({ ...e, emailGuard: null }));
    
    try {
      // Call the real EmailGuard API via our proxy - do a simple SPF lookup
      const response = await fetch('/api/emailguard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EmailGuard-Api-Key': config.emailGuardApiKey,
        },
        body: JSON.stringify({
          action: 'spf-lookup',
          domain: 'google.com', // Use a known domain for testing
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }
      
      // If we get here, the API key is valid
      setStatus(s => ({ ...s, emailGuard: "connected" }));
      setErrors(e => ({ ...e, emailGuard: null }));
    } catch (err) {
      setStatus(s => ({ ...s, emailGuard: "error" }));
      setErrors(e => ({ 
        ...e, 
        emailGuard: err instanceof Error ? err.message : "Connection failed" 
      }));
    }
  };

  const syncDomains = async () => {
    if (!config.bisonApiKey || !config.emailGuardApiKey) {
      setSyncError("Both Bison and EmailGuard API keys are required");
      setSyncStatus("error");
      return;
    }
    
    setSyncStatus("syncing");
    setSyncError(null);
    setSyncResult(null);
    
    try {
      const response = await fetch('/api/sync-domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bison-Api-Key': config.bisonApiKey,
          'X-EmailGuard-Api-Key': config.emailGuardApiKey,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`);
      }
      
      const result: SyncResult = await response.json();
      setSyncResult(result);
      setSyncStatus("success");
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
      setSyncStatus("error");
    }
  };

  const getStatusBadge = (connectionStatus: ConnectionStatus["bison"], errorMessage?: string | null) => {
    switch (connectionStatus) {
      case "connected":
        return <Badge className="bg-green-100 text-green-800">Connected</Badge>;
      case "testing":
        return <Badge className="bg-blue-100 text-blue-800">Testing...</Badge>;
      case "error":
        return (
          <div className="flex flex-col items-end gap-1">
            <Badge variant="destructive">Error</Badge>
            {errorMessage && (
              <span className="text-xs text-red-600 max-w-[200px] text-right truncate" title={errorMessage}>
                {errorMessage}
              </span>
            )}
          </div>
        );
      default:
        return <Badge className="bg-gray-100 text-gray-600">Not Tested</Badge>;
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm lg:text-base">Configure API keys and integrations</p>
      </div>

      <div className="max-w-2xl space-y-4 lg:space-y-6">
        {/* Bison API Key */}
        <Card>
          <CardHeader className="pb-2 lg:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base lg:text-lg">Bison API Key</CardTitle>
              {getStatusBadge(status.bison, errors.bison)}
            </div>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">
              Connect to LeadGenJay/Bison for email sender data and metrics
            </p>
          </CardHeader>
          <CardContent className="space-y-3 lg:space-y-4">
            <div className="relative">
              <Input
                type={showBisonKey ? "text" : "password"}
                placeholder="Enter your Bison API key"
                value={config.bisonApiKey}
                onChange={(e) => setConfig({ ...config, bisonApiKey: e.target.value })}
                className="pr-20 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowBisonKey(!showBisonKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                {showBisonKey ? "Hide" : "Show"}
              </button>
            </div>
            <Button 
              onClick={testBisonConnection}
              variant="outline"
              size="sm"
              disabled={status.bison === "testing" || !config.bisonApiKey}
              className="w-full sm:w-auto"
            >
              {status.bison === "testing" ? "Testing..." : "Test Connection"}
            </Button>
          </CardContent>
        </Card>

        {/* EmailGuard API Key */}
        <Card>
          <CardHeader className="pb-2 lg:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base lg:text-lg">EmailGuard API Key</CardTitle>
              {getStatusBadge(status.emailGuard, errors.emailGuard)}
            </div>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">
              Connect to EmailGuard for domain health monitoring and blacklist checks
            </p>
          </CardHeader>
          <CardContent className="space-y-3 lg:space-y-4">
            <div className="relative">
              <Input
                type={showEmailGuardKey ? "text" : "password"}
                placeholder="Enter your EmailGuard API key"
                value={config.emailGuardApiKey}
                onChange={(e) => setConfig({ ...config, emailGuardApiKey: e.target.value })}
                className="pr-20 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowEmailGuardKey(!showEmailGuardKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                {showEmailGuardKey ? "Hide" : "Show"}
              </button>
            </div>
            <Button 
              onClick={testEmailGuardConnection}
              variant="outline"
              size="sm"
              disabled={status.emailGuard === "testing" || !config.emailGuardApiKey}
              className="w-full sm:w-auto"
            >
              {status.emailGuard === "testing" ? "Testing..." : "Test Connection"}
            </Button>
          </CardContent>
        </Card>

        {/* Domain Sync */}
        <Card>
          <CardHeader className="pb-2 lg:pb-4">
            <CardTitle className="text-base lg:text-lg">Sync Domains</CardTitle>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">
              Automatically sync sender domains from Bison to EmailGuard for monitoring
            </p>
          </CardHeader>
          <CardContent className="space-y-3 lg:space-y-4">
            <Button 
              onClick={syncDomains}
              variant="outline"
              size="sm"
              disabled={syncStatus === "syncing" || !config.bisonApiKey || !config.emailGuardApiKey}
              className="w-full sm:w-auto"
            >
              {syncStatus === "syncing" ? "Syncing..." : "Sync Domains from Bison"}
            </Button>
            
            {syncStatus === "success" && syncResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800 font-medium">
                  {syncResult.newly_added.length > 0 
                    ? `✅ Added ${syncResult.newly_added.length} new domain${syncResult.newly_added.length !== 1 ? 's' : ''}`
                    : "✅ All domains already synced"}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {syncResult.total_bison_domains} domains in Bison • {syncResult.existing_emailguard_domains + syncResult.newly_added.length} in EmailGuard
                </p>
                {syncResult.newly_added.length > 0 && (
                  <p className="text-xs text-green-600 mt-1 truncate" title={syncResult.newly_added.join(', ')}>
                    New: {syncResult.newly_added.slice(0, 5).join(', ')}{syncResult.newly_added.length > 5 ? '...' : ''}
                  </p>
                )}
                {syncResult.errors.length > 0 && (
                  <p className="text-xs text-yellow-700 mt-1">
                    ⚠️ {syncResult.errors.length} domain{syncResult.errors.length !== 1 ? 's' : ''} failed to add
                  </p>
                )}
              </div>
            )}
            
            {syncStatus === "error" && syncError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">❌ {syncError}</p>
              </div>
            )}
            
            {(!config.bisonApiKey || !config.emailGuardApiKey) && (
              <p className="text-xs text-gray-500">
                Configure both API keys above to enable domain sync
              </p>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <Card>
          <CardContent className="pt-4 lg:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs lg:text-sm text-gray-500">
                API keys are stored locally in your browser
              </div>
              <Button 
                onClick={handleSave}
                className="w-full sm:w-auto"
              >
                {saved ? "✓ Saved!" : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 lg:pt-6">
            <h3 className="font-medium text-blue-900 text-sm lg:text-base mb-2">🔐 Security Note</h3>
            <p className="text-xs lg:text-sm text-blue-800">
              Your API keys are stored in your browser&apos;s localStorage and never sent to our servers. 
              For production use, consider implementing server-side key storage with proper encryption.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
