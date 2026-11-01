import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://private-stock-ledger.pastelbear20.chatgpt.site"),
  title: "做T收益计算器",
  description: "按固定费率计算A股买入、卖出及多笔合并卖出的预计收益。",
  openGraph: {
    title: "做T收益计算器",
    description: "单笔和多笔合并卖出收益快速测算。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "做T收益计算器",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "做T收益计算器",
    description: "单笔和多笔合并卖出收益快速测算。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
