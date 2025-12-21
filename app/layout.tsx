import type { Metadata } from "next";
import "./globals.css";
import { SimPollingProvider } from "./components/SimPollingProvider";

export const metadata: Metadata = {
  title: "Orbital Compute Comparison",
  description: "Physics-based economic model for orbital vs ground compute",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body suppressHydrationWarning className="h-full bg-dark-bg text-white">
        <SimPollingProvider>{children}</SimPollingProvider>
      </body>
    </html>
  );
}
