import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yeecheck",
  description: "아이콘 중심의 로컬 블록 시간 관리 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
