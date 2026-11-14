import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Besley } from "next/font/google";
import { DemoBar } from "@/components/demo-bar";
import "./globals.css";

// Besley is a Clarendon, the face of old law-office signs and of the American West. Atkinson Hyperlegible
// was drawn for readers with low vision, which suits a practice whose clients are often older.
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const besley = Besley({ variable: "--font-besley", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Law firm front office (demo)", template: "%s | Law firm front office (demo)" },
  description:
    "A demonstration build by ChopMedia: client intake, conflict checking and engagement letters for a small law firm. Fictional firm, sample data.",
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atkinson.variable} ${besley.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DemoBar />
        {children}
      </body>
    </html>
  );
}
