"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number; above: boolean } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipW = 256; // w-64 = 16rem = 256px
    const pad = 8;

    // Horizontal: center on trigger, but clamp to viewport
    let left = rect.left + rect.width / 2 - tooltipW / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tooltipW - pad));

    // Arrow points to trigger center
    const arrowLeft = rect.left + rect.width / 2 - left;

    // Vertical: prefer above, fall back to below
    // Using fixed positioning, so use viewport-relative values (no scrollY)
    const spaceAbove = rect.top;
    const above = spaceAbove > 80;
    const top = above
      ? rect.top - 8 // tooltip bottom edge, gap of 8px
      : rect.bottom + 8;

    setPos({ top, left, arrowLeft, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        role="img"
        aria-label="More info"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`ml-1 w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700 text-[10px] font-bold inline-flex items-center justify-center transition-colors cursor-help select-none ${className}`}
      >
        ?
      </span>
      {open && pos && createPortal(
        <div
          ref={tooltipRef}
          className="fixed w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-[9999] leading-relaxed pointer-events-none"
          style={{
            top: pos.above ? undefined : `${pos.top}px`,
            bottom: pos.above ? `${window.innerHeight - pos.top}px` : undefined,
            left: `${pos.left}px`,
          }}
        >
          {text}
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent ${
              pos.above
                ? "top-full border-t-[6px] border-t-gray-900"
                : "bottom-full border-b-[6px] border-b-gray-900"
            }`}
            style={{ left: pos.arrowLeft - 6 }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
