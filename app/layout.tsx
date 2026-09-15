import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TokFire Bench — Local AI benchmarks | TokFire Labs",
  description: "Benchmark local GGUF and MLX models on your Mac. Measure tokens per second, response latency and concurrent jobs with TokFire Bench by TokFire Labs.",
  applicationName: "TokFire Bench",
  authors: [{ name: "TokFire Labs" }],
  openGraph: { title: "TokFire Bench", description: "Know your model. Know your Mac. Local AI benchmarks by TokFire Labs.", siteName: "TokFire", type: "website" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
