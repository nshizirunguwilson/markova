import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import { BrandProvider } from "@/components/brand-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/app-toaster";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The shared type family - mobile loads the same four weights via expo-font.
// See design/tokens.json → font.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Markova - School Management System",
  description: "Self-hosted school management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Before the first paint, not after hydration. Without this the page
          is painted light and then corrected, which is a full-screen white
          flash on every navigation for anyone reading in the dark. It sets
          one attribute and swallows its own errors.
        */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <QueryProvider>
            <BrandProvider>{children}</BrandProvider>
            <AppToaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
