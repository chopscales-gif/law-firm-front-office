import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { DemoBar } from "@/components/demo-bar";
import "./globals.css";

const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Law firm front office (demo)", template: "%s | Law firm front office (demo)" },
  description:
    "A demonstration build by ChopMedia: client intake, conflict checking and engagement letters for a small law firm. Fictional firm, sample data.",
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DemoBar />
        {children}
      </body>
    </html>
  );
}
