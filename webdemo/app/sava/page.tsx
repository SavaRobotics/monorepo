"use client"

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
  Loader2,
  FileText,
  Database,
  Package,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useRef } from "react"
import { WorkflowStatus, WorkflowStepConfig } from "@/src/types/workflow"

// Workflow step configuration
const workflowStepConfigs: WorkflowStepConfig[] = [
  { id: 'analyze-workflow-input', title: 'Analyzing Input', icon: BarChart3 },
  { id: 'execute-unfold', title: 'Unfolding CAD File', icon: Factory },
  { id: 'analyze-unfold-results', title: 'Analyzing Results', icon: BarChart3 },
  { id: 'save-dxf-to-supabase', title: 'Uploading DXF', icon: CloudDrizzle },
  { id: 'update-parts-table-with-dxf', title: 'Updating Database', icon: Database },
  { id: 'get-all-dxf-files-urls', title: 'Fetching DXF Files', icon: FileText },
  { id: 'analyze-database-operations', title: 'Analyzing Database', icon: Database },
  { id: 'call-nester-docker', title: 'Nesting Parts', icon: Package },
  { id: 'upload-nested-dxf-to-supabase-step', title: 'Uploading Nested DXF', icon: UploadCloud },
  { id: 'analyze-nesting-results', title: 'Analyzing Nesting', icon: BarChart3 },
  { id: 'generate-gcode-from-nested-dxf', title: 'Generating G-code', icon: Bot },
  { id: 'upload-gcode-to-supabase', title: 'Uploading G-code', icon: UploadCloud },
  { id: 'provide-final-analysis', title: 'Final Analysis', icon: BarChart3 },
]

export default function AiTaskAppPage() {
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null)
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStatus[]>([])
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [workflowLogs, setWorkflowLogs] = useState<any[]>([])
  const [showStlViewer, setShowStlViewer] = useState(false)
  const [showDxfViewer, setShowDxfViewer] = useState(false)
  const [showGcodeViewer, setShowGcodeViewer] = useState(false)
  const [showNestedDxfViewer, setShowNestedDxfViewer] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Start workflow
  const startWorkflow = async () => {
    try {
      setIsRunning(true)
      setWorkflowLogs([]) // Reset logs for new workflow
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cadFileUrl: 'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles//Zipline-003.step',
          kFactor: 0.038,
          outputFormat: 'dxf',
        }),
      })

      const data = await response.json()
      if (data.runId) {
        setWorkflowRunId(data.runId)
      }
    } catch (error) {
      console.error('Failed to start workflow:', error)
      setIsRunning(false)
    }
  }

  // Connect to SSE for status updates
  useEffect(() => {
    if (!workflowRunId) return

    const eventSource = new EventSource(`/api/workflow/status/${workflowRunId}`)

    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data)
      if (data.steps) {
        setWorkflowSteps(data.steps)
      }
      if (data.currentStep) {
        setCurrentStep(data.currentStep)
        setSelectedStepId(data.currentStep)
      }
      if (data.logs) {
        setWorkflowLogs(data.logs)
      }
      if (data.status === 'completed' || data.status === 'failed') {
        setIsRunning(false)
      }
    })

    eventSource.addEventListener('error', () => {
      console.error('SSE connection error')
      eventSource.close()
      setIsRunning(false)
    })

    return () => {
      eventSource.close()
    }
  }, [workflowRunId])

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [workflowLogs])

  // Handle STL viewer display
  useEffect(() => {
    if (currentStep === 'analyze-workflow-input' && selectedStepId === 'analyze-workflow-input') {
      setShowStlViewer(true)
      const timer = setTimeout(() => {
        setShowStlViewer(false)
      }, 3000)
      return () => clearTimeout(timer)
    } else {
      setShowStlViewer(false)
    }
  }, [currentStep, selectedStepId])

  // Handle DXF viewer display
  useEffect(() => {
    if (currentStep === 'execute-unfold' && selectedStepId === 'execute-unfold') {
      setShowDxfViewer(true)
      const timer = setTimeout(() => {
        setShowDxfViewer(false)
      }, 4000)
      return () => clearTimeout(timer)
    } else {
      setShowDxfViewer(false)
    }
  }, [currentStep, selectedStepId])

  // Handle G-code viewer display
  useEffect(() => {
    if (currentStep === 'generate-gcode-from-nested-dxf' && selectedStepId === 'generate-gcode-from-nested-dxf') {
      setShowGcodeViewer(true)
      const timer = setTimeout(() => {
        setShowGcodeViewer(false)
      }, 5000)
      return () => clearTimeout(timer)
    } else {
      setShowGcodeViewer(false)
    }
  }, [currentStep, selectedStepId])

  // Handle nested DXF viewer display
  useEffect(() => {
    if (currentStep === 'call-nester-docker' && selectedStepId === 'call-nester-docker') {
      setShowNestedDxfViewer(true)
      const timer = setTimeout(() => {
        setShowNestedDxfViewer(false)
      }, 4000)
      return () => clearTimeout(timer)
    } else {
      setShowNestedDxfViewer(false)
    }
  }, [currentStep, selectedStepId])

  // Get step status
  const getStepStatus = (stepId: string): 'todo' | 'in-progress' | 'done' | 'error' => {
    const step = workflowSteps.find(s => s.stepId === stepId)
    return step?.status || 'todo'
  }

  // Get current tool call
  const getCurrentToolCall = (): string => {
    if (!currentStep) return ''
    const step = workflowSteps.find(s => s.stepId === currentStep)
    return step?.toolCall || step?.description || ''
  }

  // Calculate overall workflow progress
  const getOverallProgress = (): number => {
    if (workflowSteps.length === 0) return 0
    
    const completedSteps = workflowSteps.filter(s => s.status === 'done').length
    const currentStepProgress = workflowSteps.find(s => s.status === 'in-progress')?.progress || 0
    
    // Calculate total progress including partial progress of current step
    const baseProgress = (completedSteps / workflowStepConfigs.length) * 100
    const currentProgress = (currentStepProgress / 100) * (100 / workflowStepConfigs.length)
    
    return Math.round(baseProgress + currentProgress)
  }

  // Get count of completed steps
  const getCompletedStepsCount = (): number => {
    return workflowSteps.filter(s => s.status === 'done').length
  }

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

        <Button 
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 justify-between"
          onClick={startWorkflow}
          disabled={isRunning}
        >
          <div className="flex items-center">
            {isRunning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            {isRunning ? 'Running workflow...' : 'Start CAD Workflow'}
          </div>
        </Button>

        <nav className="flex-1 space-y-1 overflow-y-auto -mr-2 pr-2">
          <ol className="space-y-1">
            {workflowStepConfigs.map((config) => {
              const status = getStepStatus(config.id)
              const Icon = config.icon
              const isSelected = selectedStepId === config.id
              const isActive = currentStep === config.id
              
              return (
                <li
                  key={config.id}
                  className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${
                    isSelected ? "bg-zinc-700" : "hover:bg-zinc-800"
                  }`}
                  onClick={() => setSelectedStepId(config.id)}
                >
                  <div className="mr-3">
                    <Icon className={`w-5 h-5 ${
                      isActive ? "text-zinc-100" : "text-zinc-500"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-sm ${
                      isSelected || isActive ? "text-zinc-100" : "text-zinc-300"
                    }`}>
                      {config.title}
                    </h3>
                  </div>
                  <div className="ml-2">
                    {status === "done" && (
                      <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {status === "in-progress" && (
                      <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full animate-ping" />
                      </div>
                    )}
                    {status === "error" && (
                      <div className="w-5 h-5 bg-red-600 rounded-full" />
                    )}
                    {status === "todo" && (
                      <div className="w-5 h-5 border border-zinc-500 rounded-full" />
                    )}
                  </div>
                </li>
              )
            })}
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

      {/* SAVA's Computer (formerly right sidebar) */}
      <aside className="flex-1 flex flex-col bg-zinc-850 overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold text-zinc-100">SAVA's Computer</h2>
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
              {getCurrentToolCall() || 'Waiting for workflow...'}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-6 bg-zinc-850 flex items-center justify-center">
          {selectedStepId ? (
            <div className="w-full h-full flex items-center justify-center">
              {selectedStepId === 'analyze-workflow-input' && currentStep === 'analyze-workflow-input' && showStlViewer ? (
                // Show iframe during step file analysis for 3 seconds
                <div className="relative w-full max-w-6xl aspect-video rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
                  <iframe
                    src="http://localhost:7892/view-stl?url=https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles//Zipline-003.stl"
                    className="w-full h-full"
                    title="STL Viewer"
                  />
                </div>
              ) : selectedStepId === 'execute-unfold' && currentStep === 'execute-unfold' && showDxfViewer ? (
                // Show iframe during DXF unfolding for 4 seconds
                <div className="relative w-full max-w-6xl aspect-video rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
                  <iframe
                    src="http://localhost:7892/view-dxf?url=https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/dxffiles/unfolds/2025-06-02T05-22-07-776Z_unfold_916e1fd8-ab71-4cc2-8431-fb7106015128.dxf"
                    className="w-full h-full"
                    title="DXF Viewer"
                  />
                </div>
              ) : selectedStepId === 'generate-gcode-from-nested-dxf' && currentStep === 'generate-gcode-from-nested-dxf' && showGcodeViewer ? (
                // Show iframe during G-code generation for 5 seconds
                <div className="relative w-full max-w-6xl aspect-video rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
                  <iframe
                    src="http://localhost:7892/view-gcode?url=https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/gcodefiles//nested_6parts_1.5mm_complete.gcode"
                    className="w-full h-full"
                    title="G-code Viewer"
                  />
                </div>
              ) : selectedStepId === 'call-nester-docker' && currentStep === 'call-nester-docker' && showNestedDxfViewer ? (
                // Show iframe during nesting for 4 seconds
                <div className="relative w-full max-w-6xl aspect-video rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
                  <iframe
                    src="http://localhost:7892/view-dxf?url=https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles//nested_2025-06-02T05-04-39-918Z.dxf"
                    className="w-full h-full"
                    title="Nested DXF Viewer"
                  />
                </div>
              ) : (
                // Show regular step info
                <div className="w-full max-w-4xl space-y-4">
                  {(() => {
                    const selectedStep = workflowSteps.find(s => s.stepId === selectedStepId)
                    const config = workflowStepConfigs.find(c => c.id === selectedStepId)
                    const Icon = config?.icon || BarChart3
                    
                    return (
                      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
                        <div className="flex items-start space-x-4">
                          <div className="p-3 bg-zinc-800 rounded-lg">
                            <Icon className="w-6 h-6 text-zinc-300" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <h3 className="text-lg font-semibold text-zinc-100">
                              {config?.title || selectedStepId}
                            </h3>
                            <p className="text-sm text-zinc-400">
                              {selectedStep?.description || 'Waiting for execution...'}
                            </p>
                            {selectedStep?.toolCall && (
                              <div className="mt-3 p-3 bg-zinc-800 rounded-md">
                                <p className="text-xs text-zinc-500 mb-1">Current operation:</p>
                                <p className="text-sm text-zinc-300">{selectedStep.toolCall}</p>
                              </div>
                            )}
                            {selectedStep?.status === 'in-progress' && selectedStep?.progress !== undefined && (
                              <div className="mt-3">
                                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                                  <span>Progress</span>
                                  <span>{selectedStep.progress}%</span>
                                </div>
                                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${selectedStep.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            {selectedStep?.status === 'done' && (
                              <span className="text-xs text-green-500">Completed</span>
                            )}
                            {selectedStep?.status === 'in-progress' && (
                              <span className="text-xs text-yellow-500">In Progress</span>
                            )}
                            {selectedStep?.status === 'error' && (
                              <span className="text-xs text-red-500">Error</span>
                            )}
                            {selectedStep?.status === 'todo' && (
                              <span className="text-xs text-zinc-500">Pending</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full max-w-6xl aspect-video rounded-lg border border-zinc-700 overflow-hidden bg-zinc-800">
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-zinc-500">Click "Start CAD Workflow" to begin</p>
              </div>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-zinc-800 flex-shrink-0 space-y-3">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                const currentIndex = workflowStepConfigs.findIndex(c => c.id === currentStep);
                if (currentIndex > 0) {
                  setSelectedStepId(workflowStepConfigs[currentIndex - 1].id);
                }
              }}
              disabled={!isRunning}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-zinc-400 hover:text-zinc-200"
              disabled
            >
              <Play className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                const currentIndex = workflowStepConfigs.findIndex(c => c.id === currentStep);
                if (currentIndex < workflowStepConfigs.length - 1) {
                  setSelectedStepId(workflowStepConfigs[currentIndex + 1].id);
                }
              }}
              disabled={!isRunning}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ 
                  width: `${getOverallProgress()}%` 
                }}
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <div className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'
              }`}></div>
              <span className="text-xs text-zinc-400">
                {isRunning ? 'live' : 'offline'}
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {getCompletedStepsCount()}/{workflowStepConfigs.length} <ChevronUp className="inline w-3 h-3" />
          </div>
        </footer>
      </aside>

      {/* Right Sidebar - LLM Logs */}
      <aside className="w-80 flex-shrink-0 bg-zinc-900 flex flex-col border-l border-zinc-800">
        <header className="p-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">LLM Logs</h2>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
          <div className="space-y-1">
            {workflowLogs.map((log, index) => {
              // Determine log color based on content and level
              let textColor = 'text-zinc-400'
              
              if (log.level === 'error') {
                textColor = 'text-red-400'
              } else if (log.level === 'warn') {
                textColor = 'text-yellow-400'
              } else if (log.message.includes('✅')) {
                textColor = 'text-green-400'
              } else if (log.message.includes('🔧') || log.message.includes('🔨')) {
                textColor = 'text-blue-400'
              } else if (log.message.includes('📝') || log.message.includes('🤔')) {
                textColor = 'text-yellow-400'
              } else if (log.message.includes('📤') || log.message.includes('☁️')) {
                textColor = 'text-cyan-400'
              } else if (log.message.includes('❌')) {
                textColor = 'text-red-400'
              } else if (log.message.includes('⚠️')) {
                textColor = 'text-orange-400'
              } else if (log.message.includes('Analysis:')) {
                textColor = 'text-purple-400'
              }
              
              return (
                <div key={index} className={`${textColor} break-words`}>
                  [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                </div>
              )
            })}
            
            {/* Initial state */}
            {workflowLogs.length === 0 && !isRunning && (
              <div className="text-zinc-500">
                Waiting for workflow to start...
              </div>
            )}
            
            {/* Cursor */}
            {isRunning && (
              <div className="text-zinc-400 animate-pulse">
                █
              </div>
            )}
            
            {/* Auto-scroll anchor */}
            <div ref={logsEndRef} />
          </div>
        </div>
      </aside>

    </div>
  )
}