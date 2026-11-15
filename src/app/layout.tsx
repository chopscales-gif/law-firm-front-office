import type { Metadata, Viewport } from "next";
import { Besley, Source_Sans_3 } from "next/font/google";
import { DemoBar } from "@/components/demo-bar";
import { LiveUpdates } from "@/components/live-updates";
import { StoryProvider } from "@/components/story";
import { currentFirm } from "@/server/session";
import "./globals.css";

// Besley is a Clarendon, the face of old law-office signs and of the American West. Source Sans 3 is a
// plain, open humanist sans that stays readable for a practice whose clients are often older.
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"] });
const besley = Besley({ variable: "--font-besley", subsets: ["latin"], style: ["normal", "italic"] });

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
    <html lang="en" className={`${sourceSans.variable} ${besley.variable} h-full antialiased`}>
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
