import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Economics of Orbital vs Terrestrial Data Centers | astrocompute.dev",
  description: "Interactive first-principles cost analysis comparing orbital solar power satellites to terrestrial natural gas for datacenter capacity. Based on Andrew McCalip's model.",
  openGraph: {
    title: "Economics of Orbital vs Terrestrial Data Centers",
    description: "Interactive first-principles cost analysis comparing orbital solar to terrestrial natural gas.",
    type: "website",
  },
};

export default function McCalipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

