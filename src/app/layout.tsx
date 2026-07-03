import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://sql-playground-xi.vercel.app";
const TITLE = "SQL Playground — Learn, Run & Visualize SQL Online (Free)";
const DESC =
  "Free online SQL playground to learn, practice and visualize SQL in your browser — no signup. Run real PostgreSQL, SQLite & MySQL queries, build tables, and see JOINs animated step by step with an AI tutor.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · SQL Playground",
  },
  description: DESC,
  applicationName: "SQL Playground",
  keywords: [
    "sql playground",
    "online sql editor",
    "learn sql",
    "practice sql online",
    "sql visualizer",
    "sql join visualizer",
    "postgresql playground",
    "mysql online",
    "sqlite online",
    "run sql online",
    "free sql editor",
    "sql tutorial",
    "sql editor in browser",
    "sql sandbox",
  ],
  authors: [{ name: "mobashir-raza-vst-au4", url: "https://github.com/mobashir-raza-vst-au4" }],
  creator: "mobashir-raza-vst-au4",
  category: "education",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SQL Playground",
    title: TITLE,
    description: DESC,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
};

// Structured data so search engines can show it as a rich web-app result.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SQL Playground",
  url: SITE_URL,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web browser)",
  description: DESC,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Run PostgreSQL, SQLite and MySQL queries in the browser",
    "Visual table builder with seed data",
    "Animated JOIN and query execution visualizer",
    "Schema-aware autocomplete and inline SQL linting",
    "AI tutor (Claude, ChatGPT or Gemini)",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Set theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sqlpg:theme')||'dark';document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
