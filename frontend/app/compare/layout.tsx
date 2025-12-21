import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orbital Compute Economics: Static vs Dynamic Analysis | astrocompute.dev",
  description: "Validating the static baseline orbital compute model and exploring trajectory-based economics. Current costs agree within 4%, but dynamic analysis reveals when space becomes viable (~2028).",
  openGraph: {
    title: "Orbital Compute Economics: Static vs Dynamic Analysis",
    description: "Validating the static baseline orbital compute model and exploring trajectory-based economics.",
    type: "website",
  },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

