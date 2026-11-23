import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { DemoBar } from "@/components/demo-bar";
import { LiveUpdates } from "@/components/live-updates";
import { StoryProvider } from "@/components/story";
import { currentFirm } from "@/server/session";
import "./globals.css";

// Hanken Grotesk is a soft, round grotesque that stays readable at a light weight, for a practice whose
// clients are often older. Newsreader carries the one serif phrase in each headline, and every figure.
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Law firm front office (demo)", template: "%s | Law firm front office (demo)" },
  description:
    "A demonstration build by ChopMedia: client intake, conflict checking and engagement letters for a small law firm. Invented sample data; nothing is sent.",
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Only the name is read here, without creating anything, so the bar can say honestly whose name is on the page.
  const firm = await currentFirm();
  return (
    <html lang="en" className={`${hanken.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <StoryProvider>
          <DemoBar firm={firm} />
          {children}
        </StoryProvider>
        <LiveUpdates />
      </body>
    </html>
  );
}
