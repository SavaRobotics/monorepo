"""Tool calling logic and coordination."""

from typing import Any, Dict, List, Optional
import json
import structlog

from .client import LLMClient, Message, ToolCall

logger = structlog.get_logger()


class ToolRegistry:
    """Registry for available tools/functions."""
    
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


class BrainOrchestrator:
    """Main orchestrator for LLM tool calling."""
    
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client
        self.tool_registry = ToolRegistry()
        self.conversation_history: List[Message] = []
    
    def register_tool(self, name: str, schema: Dict, handler: callable):
        """Register a tool with the orchestrator."""
        self.tool_registry.register_tool(name, schema, handler)
    
    async def process_message(self, user_message: str) -> str:
        """Process a user message and return the response."""
        # Add user message to conversation
        self.conversation_history.append(Message(role="user", content=user_message))
        
        # Get available tools
        tools = self.tool_registry.get_tool_schemas()
        
        # Get LLM response
        response = await self.llm_client.chat(
            messages=self.conversation_history,
            tools=tools if tools else None
        )
        
        # Handle tool calls if any
        if response.tool_calls:
            tool_results = []
            for tool_call in response.tool_calls:
                try:
                    result = await self.tool_registry.execute_tool(tool_call)
                    tool_results.append(f"Tool {tool_call.name} result: {result}")
                except Exception as e:
                    tool_results.append(f"Tool {tool_call.name} failed: {str(e)}")
            
            # Add assistant message with content if any
            if response.content:
                self.conversation_history.append(Message(role="assistant", content=response.content))
            
            # Get final response with tool results
            tool_context = "\n".join(tool_results)
            final_message = f"Based on the tool results:\n{tool_context}\n\nPlease provide a final response to the user. You still have access to the same tools if needed."
            self.conversation_history.append(Message(role="user", content=final_message))
            
            # Allow for another round of tool calls
            final_response = await self.llm_client.chat(
                messages=self.conversation_history,
                tools=tools if tools else None
            )
            
            # If there are more tool calls, handle them
            if final_response.tool_calls:
                # Handle the additional tool calls
                more_results = []
                for tool_call in final_response.tool_calls:
                    try:
                        result = await self.tool_registry.execute_tool(tool_call)
                        more_results.append(f"Tool {tool_call.name} result: {result}")
                    except Exception as e:
                        more_results.append(f"Tool {tool_call.name} failed: {str(e)}")
                
                # Combine all results
                all_results = tool_results + more_results
                combined_context = "\n".join(all_results)
                
                # Get final response after all tools
                self.conversation_history.append(Message(
                    role="user", 
                    content=f"All tool executions complete. Results:\n{combined_context}\n\nProvide a final summary."
                ))
                
                summary_response = await self.llm_client.chat(messages=self.conversation_history)
                response_content = summary_response.content
            else:
                response_content = final_response.content
        else:
            response_content = response.content
        
        # Add final response to conversation
        self.conversation_history.append(Message(role="assistant", content=response_content))
        
        return response_content
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []