import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/context/ThemeContext";

export const metadata: Metadata = {
  title: "تسکان | مدیریت پروژه و استارتاپ",
  description: "سامانه مدیریت پروژه، تسک و تیم برای کسب‌وکارها و استارتاپ‌ها",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
