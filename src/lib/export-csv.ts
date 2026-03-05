/**
 * CSV Export Utility
 * Handles proper CSV escaping and triggers browser download
 */

interface ColumnDefinition {
  key: string;
  header: string;
}

/**
 * Escape a value for CSV format
 * - Wraps in quotes if contains comma, quote, or newline
 * - Escapes quotes by doubling them
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  
  const stringValue = String(value);
  
  // Check if we need to escape
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r")) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Get nested property value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce((current: unknown, part: string) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/**
 * Export data to CSV and trigger browser download
 * @param data - Array of objects to export
 * @param filename - Name of the file (without extension, date will be appended)
 * @param columns - Column definitions with key (data property) and header (CSV header)
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns: ColumnDefinition[]
): void {
  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Build CSV content
  const lines: string[] = [];

  // Add header row
  const headerRow = columns.map((col) => escapeCSVValue(col.header)).join(",");
  lines.push(headerRow);

  // Add data rows
  for (const row of data) {
    const values = columns.map((col) => {
      const value = getNestedValue(row, col.key);
      return escapeCSVValue(value);
    });
    lines.push(values.join(","));
  }

  const csvContent = lines.join("\n");

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  // Generate filename with date
  const date = new Date().toISOString().split("T")[0];
  const fullFilename = `${filename}-${date}.csv`;

  // Create temporary link and click it
  const link = document.createElement("a");
  link.href = url;
  link.download = fullFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Pre-defined column configurations for common exports
 */
export const EMAIL_ACCOUNTS_COLUMNS: ColumnDefinition[] = [
  { key: "email", header: "Email" },
  { key: "name", header: "Name" },
  { key: "domain", header: "Domain" },
  { key: "status", header: "Status" },
  { key: "warmupEnabled", header: "Warmup" },
  { key: "dailyLimit", header: "Daily Limit" },
  { key: "totalSent", header: "Sent" },
  { key: "totalReplies", header: "Replies" },
  { key: "replyRate", header: "Reply Rate %" },
];

export const DOMAINS_COLUMNS: ColumnDefinition[] = [
  { key: "domain", header: "Domain" },
  { key: "totalEmails", header: "Total Emails" },
  { key: "healthyEmails", header: "Healthy" },
  { key: "warningEmails", header: "Warning" },
  { key: "burnedEmails", header: "Burned" },
  { key: "spfValid", header: "SPF" },
  { key: "dkimValid", header: "DKIM" },
  { key: "dmarcValid", header: "DMARC" },
  { key: "spamScore", header: "Spam Score" },
];
