import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X Radar Dashboard",
  description: "X (Twitter) 推文抓取与回复建议系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
