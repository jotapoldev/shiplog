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
        {/* Taplog: solo en la demo pública; cuenta la visita sin datos de la persona. */}
        {READONLY && <script dangerouslySetInnerHTML={{ __html: '(()=>{let l;const h=()=>{const p=location.pathname;if(p===l)return;const r=l?location.origin+"/":document.referrer,q=l?"":location.search;l=p;navigator.sendBeacon("https://jotapol.com/r/hit",JSON.stringify({s:"shiplog",p,r,q}))},w=history.pushState;history.pushState=function(){w.apply(this,arguments);h()};addEventListener("popstate",h);h()})()' }} />}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {READONLY && (
            <p className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
              Demo de solo lectura con repos de ejemplo. Para usarlo con los tuyos,{" "}
              <a className="font-semibold underline underline-offset-4" href="https://github.com/jotapoldev/shiplog" target="_blank" rel="noreferrer">
                instalá Shiplog desde GitHub
              </a>
              .
            </p>
          )}
          <MotionProvider>{children}</MotionProvider>
          <footer className="pb-8 text-center text-xs text-muted-foreground">
            <a className="hover:text-foreground" href="https://github.com/jotapoldev/shiplog/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">
              Shiplog v{process.env.SHIPLOG_VERSION}
            </a>
          </footer>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
