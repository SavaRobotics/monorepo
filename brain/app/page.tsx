export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">Brain - MCP Server Hub</h1>
        <p className="mb-4">
          This is the web interface for the Brain module, which manages multiple MCP servers.
        </p>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Available MCP Servers:</h2>
          <ul className="list-disc list-inside">
            <li>Nesting Server (Python)</li>
            <li>Supabase Server (Node.js)</li>
            <li>Unfolder Server (Python)</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">Features:</h2>
          <ul className="list-disc list-inside">
            <li>Multi-language MCP server support</li>
            <li>Docker containerized deployment</li>
            <li>TypeScript and Python integration</li>
            <li>Real-time server management</li>
          </ul>
        </div>
      </div>
    </main>
  )
}