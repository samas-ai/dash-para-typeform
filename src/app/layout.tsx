import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard de respostas",
  description: "Respostas recebidas via webhook do Typeform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-canvas text-ink">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Dashboard de respostas
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="transition-colors hover:text-ink">
                Respostas
              </Link>
              <Link href="/analise" className="transition-colors hover:text-ink">
                Análise
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
