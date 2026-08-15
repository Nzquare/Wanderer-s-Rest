import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TrpcProvider } from "@/lib/trpc/provider";
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
  title: "Wanderer's Rest",
  description: "POS + CRM for Wanderer's Rest board game café",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // Lets "Add to Home Screen" on iOS launch full-screen, no Safari
    // chrome — iOS ignores the Web App Manifest's display mode, so this
    // meta tag is the only way it gets the same standalone feel Android
    // already gets from the manifest.
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wanderer's Rest",
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a4451",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
