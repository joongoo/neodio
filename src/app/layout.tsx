import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neodio",
  description: "브랜드 가시성 대시보드",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 헤더·사이드바는 [org]/[brand]/layout.tsx와 (global)/layout.tsx의 AppShell에 있다 —
          조직·브랜드가 URL에 들어가서, 주소가 바뀔 때 다시 그려지는 레이아웃에 둬야 한다. */}
      <body className="flex h-full flex-col">{children}</body>
    </html>
  );
}
