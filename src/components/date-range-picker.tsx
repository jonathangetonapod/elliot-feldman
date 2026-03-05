"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

export type DatePreset = "7d" | "14d" | "30d" | "custom";

export interface DateRange {
  startDate: Date;
  endDate: Date;
  preset: DatePreset;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  loading?: boolean;
  className?: string;
}

// Format date as "Mar 5, 2026"
function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

// Format date for input (YYYY-MM-DD)
function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Parse date from input
function parseDateInput(str: string): Date {
  const [year, month, day] = str.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Get preset label
function getPresetLabel(preset: DatePreset): string {
  switch (preset) {
    case "7d": return "Last 7 days";
    case "14d": return "Last 14 days";
    case "30d": return "Last 30 days";
    case "custom": return "Custom";
  }
}

// Calculate date range from preset
export function getDateRangeFromPreset(preset: DatePreset, customStart?: Date, customEnd?: Date): DateRange {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  let startDate: Date;
  
  switch (preset) {
    case "7d":
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      break;
    case "14d":
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 13);
      break;
    case "30d":
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 29);
      break;
    case "custom":
      startDate = customStart || new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
  }
  
  startDate.setHours(0, 0, 0, 0);
  
  return {
    startDate,
    endDate: preset === "custom" && customEnd ? customEnd : today,
    preset,
  };
}

export function DateRangePicker({ value, onChange, loading = false, className = "" }: DateRangePickerProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(value.preset === "custom");
  const [tempStartDate, setTempStartDate] = useState(formatDateInput(value.startDate));
  const [tempEndDate, setTempEndDate] = useState(formatDateInput(value.endDate));

  // Calculate days in range
  const daysInRange = useMemo(() => {
    const diffTime = value.endDate.getTime() - value.startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [value.startDate, value.endDate]);

  // Handle preset button click
  const handlePresetClick = (preset: DatePreset) => {
    if (preset === "custom") {
      setIsCustomOpen(true);
      setTempStartDate(formatDateInput(value.startDate));
      setTempEndDate(formatDateInput(value.endDate));
    } else {
      setIsCustomOpen(false);
      onChange(getDateRangeFromPreset(preset));
    }
  };

  // Handle custom date apply
  const handleApplyCustom = () => {
    const start = parseDateInput(tempStartDate);
    const end = parseDateInput(tempEndDate);
    
    // Validate dates
    if (start > end) {
      alert("Start date must be before end date");
      return;
    }
    
    onChange({
      startDate: start,
      endDate: end,
      preset: "custom",
    });
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {/* Header - Current Date Range Display */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {formatDateDisplay(value.startDate)} - {formatDateDisplay(value.endDate)}
              </div>
              <div className="text-xs text-gray-500">
                {getPresetLabel(value.preset)} • {daysInRange} day{daysInRange !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
          )}
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="px-4 py-3 flex flex-wrap gap-2">
        <Button
          variant={value.preset === "7d" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetClick("7d")}
          className={value.preset === "7d" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
          disabled={loading}
        >
          Last 7 days
        </Button>
        <Button
          variant={value.preset === "14d" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetClick("14d")}
          className={value.preset === "14d" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
          disabled={loading}
        >
          Last 14 days
        </Button>
        <Button
          variant={value.preset === "30d" ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetClick("30d")}
          className={value.preset === "30d" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
          disabled={loading}
        >
          Last 30 days
        </Button>
        <Button
          variant={value.preset === "custom" || isCustomOpen ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetClick("custom")}
          className={value.preset === "custom" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
          disabled={loading}
        >
          Custom
        </Button>
      </div>

      {/* Custom Date Inputs */}
      {isCustomOpen && (
        <div className="px-4 py-3 border-t bg-gray-50">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={loading}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                max={formatDateInput(new Date())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleApplyCustom}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={loading}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline version for embedding in cards
interface InlineDateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  loading?: boolean;
}

export function InlineDateRangePicker({ value, onChange, loading = false }: InlineDateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(formatDateInput(value.startDate));
  const [tempEndDate, setTempEndDate] = useState(formatDateInput(value.endDate));

  const handlePresetClick = (preset: DatePreset) => {
    if (preset === "custom") {
      setShowCustom(true);
      setTempStartDate(formatDateInput(value.startDate));
      setTempEndDate(formatDateInput(value.endDate));
    } else {
      setShowCustom(false);
      onChange(getDateRangeFromPreset(preset));
    }
  };

  const handleApplyCustom = () => {
    const start = parseDateInput(tempStartDate);
    const end = parseDateInput(tempEndDate);
    
    if (start > end) {
      return;
    }
    
    onChange({
      startDate: start,
      endDate: end,
      preset: "custom",
    });
    setShowCustom(false);
  };

  return (
    <div className="space-y-2">
      {/* Date Range Display */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="text-base">📅</span>
        <span>
          {formatDateDisplay(value.startDate)} - {formatDateDisplay(value.endDate)}
        </span>
        <span className="text-gray-400">({getPresetLabel(value.preset)})</span>
        {loading && (
          <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-600 border-t-transparent" />
        )}
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {(["7d", "14d", "30d", "custom"] as DatePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            disabled={loading}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              value.preset === preset
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            } disabled:opacity-50`}
          >
            {getPresetLabel(preset)}
          </button>
        ))}
      </div>

      {/* Custom Date Inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <input
            type="date"
            value={tempStartDate}
            onChange={(e) => setTempStartDate(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
            disabled={loading}
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={tempEndDate}
            onChange={(e) => setTempEndDate(e.target.value)}
            max={formatDateInput(new Date())}
            className="px-2 py-1 border rounded text-sm"
            disabled={loading}
          />
          <button
            onClick={handleApplyCustom}
            disabled={loading}
            className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
