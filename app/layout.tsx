import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/app/ui/LayoutWrapper";
import { LanguageProvider } from "@/lib/LanguageContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AzFinance",
  description: "Financial management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-screen overflow-hidden antialiased`}>
      <body className="h-full flex bg-gray-50">
        <LanguageProvider>
          <LayoutWrapper>{children}</LayoutWrapper>
        </LanguageProvider>
      </body>
    </html>
  );
}
