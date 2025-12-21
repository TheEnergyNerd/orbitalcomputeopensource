import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orbital Compute Economics: Trajectory-Based Analysis | astrocompute.dev",
  description: "When does orbital compute become cost-competitive? Trajectory-based $/PFLOP analysis from 2025-2040. Model by Myana.",
  openGraph: {
    title: "Orbital Compute Economics: Trajectory-Based Analysis",
    description: "When does orbital compute become cost-competitive? $/PFLOP trajectory analysis.",
    type: "website",
  },
};

export default function MyanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

