"""LLM client for handling API calls to various providers."""

import os
from typing import Any, Dict, List, Optional
from abc import ABC, abstractmethod

import openai
import anthropic
from pydantic import BaseModel


class Message(BaseModel):
    role: str
    content: str


class ToolCall(BaseModel):
    name: str
    arguments: Dict[str, Any]


class LLMResponse(BaseModel):
    content: str
    tool_calls: Optional[List[ToolCall]] = None


class LLMClient(ABC):
    @abstractmethod
    async def chat(self, messages: List[Message], tools: Optional[List[Dict]] = None) -> LLMResponse:
        pass


class OpenAIClient(LLMClient):
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4"):
        self.client = openai.AsyncOpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = model

    async def chat(self, messages: List[Message], tools: Optional[List[Dict]] = None) -> LLMResponse:
        openai_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        
        kwargs = {
            "model": self.model,
            "messages": openai_messages,
        }
        
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await self.client.chat.completions.create(**kwargs)
        
        content = response.choices[0].message.content or ""
        tool_calls = []
        
        if response.choices[0].message.tool_calls:
            for tool_call in response.choices[0].message.tool_calls:
                tool_calls.append(ToolCall(
                    name=tool_call.function.name,
                    arguments=tool_call.function.arguments
                ))

        return LLMResponse(content=content, tool_calls=tool_calls)


class AnthropicClient(LLMClient):
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
        self.model = model

    async def chat(self, messages: List[Message], tools: Optional[List[Dict]] = None) -> LLMResponse:
        # Convert messages format for Anthropic
        anthropic_messages = []
        for msg in messages:
            anthropic_messages.append({"role": msg.role, "content": msg.content})

        kwargs = {
            "model": self.model,
            "messages": anthropic_messages,
            "max_tokens": 4096,
        }
        
        if tools:
            kwargs["tools"] = tools

        response = await self.client.messages.create(**kwargs)
        
        content = ""
        tool_calls = []
        
        for block in response.content:
            if hasattr(block, 'text'):
                content += block.text
            elif hasattr(block, 'name'):  # Tool use block
                tool_calls.append(ToolCall(
                    name=block.name,
                    arguments=block.input
                ))

        return LLMResponse(content=content, tool_calls=tool_calls)


def get_llm_client(provider: str = "openai") -> LLMClient:
    """Factory function to get LLM client."""
    if provider.lower() == "openai":
        return OpenAIClient()
    elif provider.lower() == "anthropic":
        return AnthropicClient()
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")