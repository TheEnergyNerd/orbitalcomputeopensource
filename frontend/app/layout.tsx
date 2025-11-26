import type { Metadata } from "next";
import "./globals.css";
import { SimPollingProvider } from "./components/SimPollingProvider";

export const metadata: Metadata = {
  title: "Orbital Compute Control Room",
  description: "Interactive 3D visualization of orbital and ground compute infrastructure",
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

