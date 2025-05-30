import './globals.css'

export const metadata = {
  title: 'Brain - MCP Server Hub',
  description: 'Web interface for managing multiple MCP servers',
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