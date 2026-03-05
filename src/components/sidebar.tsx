"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAlertCounts } from "@/lib/use-alerts";

const navigation = [
  { name: "Dashboard", href: "/", icon: "📊" },
  { name: "Client View", href: "/client", icon: "👤" },
  { name: "Accounts", href: "/emails", icon: "📧" },
  { name: "Domain Health", href: "/domains", icon: "🌐" },
  { name: "Warmup Calendar", href: "/warmup", icon: "📅" },
  { name: "Alerts", href: "/alerts", icon: "🔔" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { counts } = useAlertCounts();
  
  // Determine badge color based on severity
  const hasCritical = counts.critical > 0;
  const hasWarning = counts.warning > 0;
  const alertCount = counts.critical + counts.warning;

  return (
    <>
      {/* Mobile Header - simplified title bar since we have bottom nav */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 py-3">
        <h1 className="text-lg font-bold text-center">Elliot Feldman</h1>
      </div>

      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden lg:flex w-64 bg-gray-900 text-white flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold">Elliot Feldman</h1>
          <p className="text-gray-400 text-sm mt-1">Email Health Monitor</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isAlerts = item.href === '/alerts';
            const showBadge = isAlerts && alertCount > 0;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative",
                  pathname === item.href
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <span className="text-lg">{item.icon}</span>
                {item.name}
                {showBadge && (
                  <span 
                    className={cn(
                      "absolute right-3 min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full text-xs font-bold text-white",
                      hasCritical ? "bg-red-500" : "bg-yellow-500"
                    )}
                  >
                    {alertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Last sync: 2 min ago
          </div>
        </div>
      </div>
    </>
  );
}
