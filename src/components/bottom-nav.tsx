"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: "📊" },
  { name: "Emails", href: "/emails", icon: "📧" },
  { name: "Domains", href: "/domains", icon: "🌐" },
  { name: "Warmup", href: "/warmup", icon: "📅" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full px-1 transition-colors",
                isActive
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              <span className={cn(
                "text-xl mb-0.5 transition-transform",
                isActive && "scale-110"
              )}>
                {item.icon}
              </span>
              <span className={cn(
                "text-[10px] font-medium truncate",
                isActive ? "text-white" : "text-gray-500"
              )}>
                {item.name}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
