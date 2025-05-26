"""Enhanced tool calling logic with sequential execution and result references."""

from typing import Any, Dict, List, Optional
import json
import structlog
import re

from .client import LLMClient, Message, ToolCall

logger = structlog.get_logger()


class ToolRegistry:
    """Registry for available tools."""
    
    def __init__(self):
        self.tools: Dict[str, Dict] = {}
        self.handlers: Dict[str, callable] = {}
    
    def register_tool(self, name: str, schema: Dict, handler: callable):
        """Register a tool with its schema and handler function."""
        self.tools[name] = schema
        self.handlers[name] = handler
        logger.info("Tool registered", tool=name)
    
    def get_tool_schemas(self) -> List[Dict]:
        """Get all tool schemas for LLM."""
        return list(self.tools.values())
    
    async def execute_tool(self, tool_call: ToolCall) -> Any:
        """Execute a tool call."""
        if tool_call.name not in self.handlers:
            raise ValueError(f"Unknown tool: {tool_call.name}")
        
        handler = self.handlers[tool_call.name]
        
        # Parse arguments if they're a string
        if isinstance(tool_call.arguments, str):
            try:
                arguments = json.loads(tool_call.arguments)
            except json.JSONDecodeError:
                arguments = {}
        else:
            arguments = tool_call.arguments
        
        logger.info("Executing tool", tool=tool_call.name, arguments=arguments)
        
        try:
            result = await handler(**arguments)
            logger.info("Tool executed successfully", tool=tool_call.name)
            return result
        except Exception as e:
            logger.error("Tool execution failed", tool=tool_call.name, error=str(e))
            raise


class EnhancedBrainOrchestrator:
    """Enhanced orchestrator for sequential tool calling with result references."""
    
    SYSTEM_PROMPT = """You are an AI assistant with access to various tools. When you need to use multiple tools:

1. You can call tools sequentially
2. Each tool call result is stored and can be referenced using @{tool_index.field_name} syntax
3. Tool results are indexed starting from 0 (first tool call is @{0}, second is @{1}, etc.)
4. You can access nested fields using dot notation: @{0.data.0.step_url}
5. When a tool result contains the data you need for the next tool, reference it directly

Example of sequential tool calling with references:
- First tool: query_table returns {"data": [{"id": 3, "step_url": "https://example.com/file.step"}]}
- Second tool: download_file using @{0.data.0.step_url} as the url parameter

Always think step by step about which tools to call and how to use previous results."""
    
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client
        self.tool_registry = ToolRegistry()
        self.conversation_history: List[Message] = []
        self.tool_results: List[Any] = []  # Store tool results for referencing
    
    def register_tool(self, name: str, schema: Dict, handler: callable):
        """Register a tool with the orchestrator."""
        self.tool_registry.register_tool(name, schema, handler)
    
    def _resolve_references(self, text: str) -> str:
        """Resolve @{index.field.path} references to actual values from tool results."""
        def replace_reference(match):
            reference = match.group(1)
            parts = reference.split('.')
            
            try:
                # Get the tool result by index
                index = int(parts[0])
                if index >= len(self.tool_results):
                    return f"@{{{reference}}} (invalid index)"
                
                # Navigate through the result
                value = self.tool_results[index]
                for part in parts[1:]:
                    if isinstance(value, dict):
                        value = value.get(part, f"@{{{reference}}} (field not found)")
                    elif isinstance(value, list):
                        try:
                            value = value[int(part)]
                        except (ValueError, IndexError):
                            return f"@{{{reference}}} (invalid list index)"
                    else:
                        return f"@{{{reference}}} (cannot access field)"
                
                return str(value)
                
            except Exception as e:
                logger.error("Failed to resolve reference", reference=reference, error=str(e))
                return f"@{{{reference}}} (error: {str(e)})"
        
        # Find and replace all @{...} references
        return re.sub(r'@\{([^}]+)\}', replace_reference, text)
    
    def _resolve_tool_arguments(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve any references in tool arguments."""
        resolved = {}
        for key, value in arguments.items():
            if isinstance(value, str):
                resolved[key] = self._resolve_references(value)
            elif isinstance(value, dict):
                resolved[key] = self._resolve_tool_arguments(value)
            elif isinstance(value, list):
                resolved[key] = [
                    self._resolve_references(item) if isinstance(item, str) else item
                    for item in value
                ]
            else:
                resolved[key] = value
        return resolved
    
    async def process_message(self, user_message: str) -> str:
        """Process a user message and return the response."""
        # Add system prompt at the beginning of each conversation
        if not self.conversation_history:
            self.conversation_history.append(Message(role="system", content=self.SYSTEM_PROMPT))
        
        if user_message:  # Don't add empty messages
            self.conversation_history.append(Message(role="user", content=user_message))
        
        # Get available tools
        tools = self.tool_registry.get_tool_schemas()
        
        # Continue getting responses until no more tool calls
        max_iterations = 10  # Prevent infinite loops
        iteration = 0
        
        while iteration < max_iterations:
            # Get LLM response
            response = await self.llm_client.chat(
                messages=self.conversation_history,
                tools=tools if tools else None
            )
            
            # If no tool calls, we're done
            if not response.tool_calls:
                self.conversation_history.append(Message(role="assistant", content=response.content))
                return response.content
            
            # Process tool calls sequentially
            iteration += 1
            tool_responses = []
            
            for i, tool_call in enumerate(response.tool_calls):
                try:
                    # Parse and resolve arguments
                    if isinstance(tool_call.arguments, str):
                        arguments = json.loads(tool_call.arguments)
                    else:
                        arguments = tool_call.arguments
                    
                    # Resolve any references in arguments
                    resolved_arguments = self._resolve_tool_arguments(arguments)
                    
                    # Create a new tool call with resolved arguments
                    resolved_tool_call = ToolCall(
                        name=tool_call.name,
                        arguments=resolved_arguments
                    )
                    
                    # Execute tool
                    result = await self.tool_registry.execute_tool(resolved_tool_call)
                    
                    # Store result for future reference
                    self.tool_results.append(result)
                    result_index = len(self.tool_results) - 1
                    
                    tool_responses.append({
                        "tool": tool_call.name,
                        "index": result_index,
                        "result": result
                    })
                    
                except Exception as e:
                    error_msg = f"Error executing {tool_call.name}: {str(e)}"
                    logger.error(error_msg)
                    tool_responses.append({
                        "tool": tool_call.name,
                        "error": str(e)
                    })
            
            # Add assistant message with tool call info
            if response.content:
                self.conversation_history.append(Message(role="assistant", content=response.content))
            
            # Format tool results for the LLM
            tool_results_text = "\n\n".join([
                f"Tool '{resp['tool']}' (result @{{{resp.get('index', 'error')}}}):\n{json.dumps(resp.get('result', resp.get('error')), indent=2)}"
                for resp in tool_responses
            ])
            
            # Add tool results as user message to continue the conversation
            self.conversation_history.append(Message(
                role="user",
                content=f"Tool execution results:\n\n{tool_results_text}\n\nPlease continue with the task or provide a final response."
            ))
        
        # If we hit max iterations, return error
        return "Maximum tool calling iterations reached. Task may be incomplete."
    
    def clear_history(self):
        """Clear conversation history and tool results."""
        self.conversation_history = []
        self.tool_results = []  # Clear tool results