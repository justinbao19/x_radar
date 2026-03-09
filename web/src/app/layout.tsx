import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { VoteProvider } from "@/lib/VoteContext";
import { ToastProvider } from "@/lib/ToastContext";
import { TelegramProvider } from "@/lib/TelegramContext";

export const metadata: Metadata = {
  title: "X Radar",
  description: "X (Twitter) 推文抓取与回复建议系统",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <TelegramProvider>
          <VoteProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </VoteProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
