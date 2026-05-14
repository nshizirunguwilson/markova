import type { Metadata } from "next";
import { Poppins } from "next/font/google";
// import { Roboto } from "next/font/google";
// import { Inter } from "next/font/google";
// import { Outfit } from "next/font/google";
// import { Open_Sans } from "next/font/google";
// import { Urbanist } from "next/font/google";
// import { Lexend } from "next/font/google";
// import { Lexend_Deca } from "next/font/google";
// import { Montserrat } from "next/font/google";
// import { DM_Sans } from "next/font/google";
// import { Playfair } from "next/font/google";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
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
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <QueryProvider>
          {children}
          <Toaster position="top-right" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
