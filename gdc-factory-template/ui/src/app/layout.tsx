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
  title: "GDC Edge Studio | Customer Portal Generator",
  description: "Automated Edge Operations, GitOps Workloads & VM Runtime Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative">
        {children}
        {/* Immutable by declaration: Powered by Google Distributed Cloud */}
        <div className="fixed bottom-3 right-3 z-[9999] pointer-events-auto select-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md transition hover:border-slate-600">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="#4285F4"/>
            <circle cx="9" cy="13" r="1.5" fill="#EA4335"/>
            <circle cx="12" cy="11" r="1.5" fill="#FBBC05"/>
            <circle cx="15" cy="13" r="1.5" fill="#34A853"/>
          </svg>
          <span className="text-[11px] font-bold tracking-tight text-slate-200">
            Powered by <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent font-extrabold">Google Distributed Cloud</span>
          </span>
        </div>
      </body>
    </html>
  );
}
