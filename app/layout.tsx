import type { Metadata } from "next";
import { IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "УБ Үнэ Тандагч — Бодит зах зээлийн үнийг шалга";
  const description = "Facebook зарын бараа, үнийг таньж Улаанбаатарын дэлгүүрүүдийн бодит үнэтэй харьцуулна.";
  return {
    title,
    description,
    metadataBase: new URL(origin),
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", locale: "mn_MN", images: [{ url: `${origin}/og.png`, width: 1731, height: 909, alt: "УБ Үнэ Тандагч — Авахаасаа өмнө бодит үнийг мэд" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <body className={`${body.variable} ${display.variable}`}>
        {children}
      </body>
    </html>
  );
}
