import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
import BottomNav from "../components/BottomNav";

export const metadata: Metadata = {
  title: "Salesbot - Automated Sales Prospecting",
  description: "Automated sales prospecting bot with AI-powered email campaigns",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0f0f0f] text-white h-screen overflow-hidden antialiased font-sans flex flex-col">
        <Navbar />
        <div className="flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 pb-2 sm:pb-4 md:pb-6 pt-0 flex flex-col relative z-0">
          <div className="flex-1 min-h-0 bg-white text-gray-900 rounded-[32px] md:rounded-[40px] w-full relative shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
            {/* Scrollable area strictly inside the white card */}
            <div className="flex-1 min-h-0 overflow-y-auto w-full pt-4 scrollbar-hide">
              {children}
            </div>

            {/* Footer with buttons and BottomNav on same line */}
            <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-white">
              <div id="leads-buttons" className="flex-1" />
              <div className="flex-1 flex items-center justify-center">
                <BottomNav />
              </div>
              <div id="outreach-button" className="flex-1 flex items-center justify-end" />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
