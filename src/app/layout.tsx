import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { AmbientBackdrop } from "@/components/ambient-backdrop";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = localFont({ src: "../../public/fonts/BricolageGrotesque-variable.ttf", variable: "--font-display", weight: "200 800", display: "swap" });

export const metadata: Metadata = {
  title: "vibe — Different places. Same track.",
  description: "A shared space for your sound. Start an anonymous listening room, invite your people, and listen together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: `/* THESIS: A graphic listening room, with personality in lettering and one playable sonic object. OWN-WORLD: paper, ink, cobalt and lilac; bespoke wordmark, flat print geometry, precise controls. STORY: choose a name, create or join, pass the aux. FIRST VIEWPORT: graphic poster left and real room form right; mobile puts entry first. FORM: independent listening booth, seed 078a41c1 revision 2. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */ try{var t=localStorage.getItem('vibe:theme')||'light';document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t==='dark'?'dark':'light'}catch{}` }} />
        <Suspense fallback={null}><AmbientBackdrop /></Suspense>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
