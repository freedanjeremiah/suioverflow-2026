import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AmbientField } from "@/components/graph/AmbientField";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mycelium · your agent's living memory",
  description:
    "Mycelium turns what your AI agent remembers into a living graph you can see, tend, and share. Pick what to share by selecting it, not by guessing depth.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="substrate-field min-h-full flex flex-col">
        <Providers>
          {/* living-network backdrop, present site-wide (behind all content) */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
            <AmbientField intensity={0.45} />
          </div>
          <SiteNav />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
