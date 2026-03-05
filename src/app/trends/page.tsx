"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Trends functionality has been merged into the Accounts page
export default function TrendsPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/emails");
  }, [router]);
  
  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">📈 Trends</h1>
        <p className="text-gray-500 mt-1">Redirecting to Accounts page...</p>
      </div>
    </div>
  );
}
