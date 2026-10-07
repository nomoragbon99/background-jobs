import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Background jobs", description: "Job queue status" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav>
            <Link href="/jobs">Jobs</Link>
            <Link href="/dead">Dead letters</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
