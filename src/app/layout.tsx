import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQL Playground — learn, run & visualize SQL",
  description:
    "An interactive in-browser SQL playground. Create tables, seed data, run any query across PostgreSQL, SQLite and MySQL, and master SQL.",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
