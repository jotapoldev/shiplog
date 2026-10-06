import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { READONLY } from "@/lib/config";
import { MotionProvider } from "./client";
import "./globals.css";

const sans = Schibsted_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shiplog",
  description: "Lo que hice cada día, desde mis commits.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {READONLY && (
            <p className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
              Demo de solo lectura con repos de ejemplo. Para usarlo con los tuyos,{" "}
              <a className="font-semibold underline underline-offset-4" href="https://github.com/jotapoldev/shiplog">
                instalá Shiplog desde GitHub
              </a>
              .
            </p>
          )}
          <MotionProvider>{children}</MotionProvider>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
