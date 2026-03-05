import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Elliot Feldman - Email Health Monitor",
  description: "Monitor email infrastructure health at scale",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
            {children}
          </main>
        </div>
        <BottomNav />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
