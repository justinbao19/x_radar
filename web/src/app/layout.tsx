import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VoteProvider } from "@/lib/VoteContext";

export const metadata: Metadata = {
  title: "X Radar Dashboard",
  description: "X (Twitter) 推文抓取与回复建议系统",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <VoteProvider>
          {children}
        </VoteProvider>
      </body>
    </html>
  );
}
