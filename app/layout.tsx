import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://private-stock-ledger.pastelbear20.chatgpt.site"),
  title: "私人持仓与做T计算器",
  description: "仅供本人使用的股票持仓、交易费用与做T盈亏计算工具。",
  openGraph: {
    title: "私人持仓台账",
    description: "底仓、做T、费用与盈亏的一站式私人计算工具。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "私人持仓台账",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "私人持仓台账",
    description: "底仓、做T、费用与盈亏的一站式私人计算工具。",
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
