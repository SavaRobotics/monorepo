import {
  LayoutGrid,
  Search,
  Plus,
  Command,
  BarChart3,
  CloudDrizzle,
  Factory,
  Bot,
  KeyRound,
  Bell,
  Laptop,
  Zap,
  UploadCloud,
  Star,
  MoreHorizontal,
  Paperclip,
  Mic,
  PencilLine,
  MonitorPlay,
  Maximize2,
  SkipBack,
  Play,
  SkipForward,
  ChevronUp,
  Check,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const tasks = [
  {
    icon: <BarChart3 className="w-5 h-5 text-zinc-500" />,
    title: "World Bank Data",
    selected: false,
    status: "completed",
  },
  {
    icon: <CloudDrizzle className="w-5 h-5 text-zinc-500" />,
    title: "Sheet Metal Companies",
    selected: false,
    status: "completed",
  },
  {
    icon: <Factory className="w-5 h-5 text-zinc-100" />,
    title: "Bay Area Shops",
    selected: true,
    status: "in-progress",
  },
  {
    icon: <Bot className="w-5 h-5 text-zinc-500" />,
    title: "SF Robotics Startups",
    selected: false,
    status: "completed",
  },
  {
    icon: <KeyRound className="w-5 h-5 text-zinc-500" />,
    title: "Fakra Connectors",
    selected: false,
    status: "todo",
  },
  {
    icon: <KeyRound className="w-5 h-5 text-zinc-500" />,
    title: "Zed Box Password",
    selected: false,
    status: "todo",
  },
]

export default function AiTaskAppPage() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-72 flex-shrink-0 bg-zinc-900 flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon">
            <LayoutGrid className="w-5 h-5 text-zinc-400" />
          </Button>
          <Button variant="ghost" size="icon">
            <Search className="w-5 h-5 text-zinc-400" />
          </Button>
        </div>

        <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 justify-between">
          <div className="flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            New task
          </div>
          <div className="flex items-center space-x-1">
            <Command className="w-3 h-3 text-zinc-400" />
            <span className="text-xs text-zinc-400 bg-zinc-700 px-1 rounded-sm">K</span>
          </div>
        </Button>

        <nav className="flex-1 space-y-1 overflow-y-auto -mr-2 pr-2">
          <ol className="space-y-1">
            {tasks.map((task, index) => (
              <li
                key={index}
                className={`flex items-center p-2 rounded-md cursor-pointer ${
                  task.selected ? "bg-zinc-700" : "hover:bg-zinc-800"
                }`}
              >
                <div className="mr-3">{task.icon}</div>
                <div className="flex-1">
                  <h3 className={`text-sm ${task.selected ? "text-zinc-100" : "text-zinc-300"}`}>{task.title}</h3>
                </div>
                <div className="ml-2">
                  {task.status === "completed" && (
                    <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {task.status === "in-progress" && (
                    <div className="w-5 h-5 bg-yellow-500 rounded-full" />
                  )}
                  {task.status === "todo" && (
                    <div className="w-5 h-5 border border-zinc-500 rounded-full" />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <div className="flex items-center space-x-2">
            <Avatar className="w-7 h-7">
              <AvatarFallback className="bg-green-600 text-white text-xs">A</AvatarFallback>
            </Avatar>
            <span className="text-sm text-zinc-200">Alessio Toniolo</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-zinc-500 hover:text-zinc-300" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            </Button>
            <Button variant="ghost" size="icon">
              <Laptop className="w-5 h-5 text-zinc-500 hover:text-zinc-300" />
            </Button>
            <Button variant="ghost" size="icon">
              <Zap className="w-5 h-5 text-zinc-500 hover:text-zinc-300" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-zinc-850 overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex justify-between items-center flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Bay Area Sheet Metal Shops for Semiconductor Industry
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <UploadCloud className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <Star className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <p className="text-sm leading-relaxed">
            Based on your requirements (mid-sized companies that are experiencing business growth), I&apos;ve identified
            two companies that best match your requirements:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Nelgo Manufacturing Co. (Oceanside) - 20-50 employees, ISO 9001-2015 and AS9100 Rev D certified, serving
              semiconductor industry since 1967
            </li>
            <li>
              Precision Ferrites & Ceramics, Inc. (Huntington Beach) - 50-100+ employees (most sources indicate 71),
              ITAR registered, serving semiconductor industry since 1971
            </li>
          </ol>
          <p className="text-sm leading-relaxed">
            I&apos;ve also included information on three smaller companies that serve the semiconductor industry but
            fall below your mid-sized criteria:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Electron Beam Industries (Anaheim) - 7-25 employees, NADCAP certified</li>
            <li>Compass & Anvil (Arroyo Grande) - &lt;25 employees, serves multiple high-growth industries</li>
            <li>Green&apos;s Metal Cut-Off (Santa Fe Springs) - ~10 employees, specializes in precision cutting</li>
          </ul>
          <p className="text-sm leading-relaxed">
            All five companies demonstrate evidence of business growth through their certifications, specialized
            capabilities, and service to high-growth industries. The attached report contains detailed profiles,
            comparative analysis, and growth indicators for each company.
          </p>
          <p className="text-sm leading-relaxed">
            Would you like me to provide any additional information about any of these companies or expand the search to
            other regions?
          </p>
        </div>

        <footer className="p-4 border-t border-zinc-800 flex-shrink-0">
          <div className="relative">
            <Input
              type="text"
              placeholder="Send message to Manus"
              className="bg-zinc-800 border-zinc-700 rounded-lg pl-10 pr-10 h-10 placeholder-zinc-500"
            />
            <Paperclip className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Mic className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </footer>
      </main>

      {/* Right Sidebar */}
      <aside className="w-[480px] flex-shrink-0 bg-zinc-900 flex flex-col border-l border-zinc-800">
        <header className="p-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold text-zinc-100">Manus&apos;s Computer</h2>
            <div className="flex items-center space-x-1">
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
                <MonitorPlay className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
                <Maximize2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center text-xs text-zinc-400 mt-1">
            <PencilLine className="w-3 h-3 mr-1.5" />
            Manus is using Editor
          </div>
          <div className="mt-2">
            <span className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md text-xs inline-block">
              Reading file research/socal/southern_california_sheet_metal_report.md
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-4 bg-zinc-850 flex items-center justify-center">
          <img
            src="/placeholder.svg?height=400&width=600"
            alt="Placeholder content"
            className="max-w-full max-h-full object-contain rounded-lg border border-zinc-700"
          />
        </div>

        <footer className="p-4 border-t border-zinc-800 flex-shrink-0 space-y-3">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <Play className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-200">
              <SkipForward className="w-4 h-4" />
            </Button>
            <div className="flex-1 h-1 bg-zinc-700 rounded-full">
              <div className="w-3/4 h-full bg-blue-500 rounded-full"></div>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-xs text-zinc-400">live</span>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            8/8 <ChevronUp className="inline w-3 h-3" />
          </div>
        </footer>
      </aside>
    </div>
  )
}