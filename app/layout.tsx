import './globals.css'

export const metadata = {
  title: 'Orbital Compute Comparison',
  description: 'Physics-based economic model for orbital vs ground compute',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

