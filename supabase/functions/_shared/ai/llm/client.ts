/**
 * LLM 客户端模块
 * 负责与 OpenRouter API 交互
 */

import { OPENROUTER_API_URL, OPENROUTER_REFERER, OPENROUTER_TITLE } from '../config.ts';
import type { ChatMessage, CallOpenRouterOptions, ParsedChatCompletionOutput } from '../types.ts';

// 解析 Chat Completions API 输出
export function parseChatCompletionOutput(data: Record<string, unknown>): ParsedChatCompletionOutput {
  const choices = data.choices as Array<{
    message: Record<string, unknown>;
  }> || [];
  
  const rawMessage = (choices[0]?.message || { role: 'assistant' }) as ChatMessage;
  
  const toolCalls = rawMessage.tool_calls as Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }> | undefined;
  
  const result: ParsedChatCompletionOutput = {
    content: typeof rawMessage.content === 'string' ? rawMessage.content : '',
    rawMessage: rawMessage
  };
  
  if (toolCalls && toolCalls.length > 0) {
    result.tool_calls = toolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments
    }));
  }
  
  return result;
}

// 调用 OpenRouter Chat Completions API
export async function callOpenRouterChatCompletionsApi(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  options: CallOpenRouterOptions = {}
): Promise<ParsedChatCompletionOutput> {
  const { tools = null, toolChoice = 'auto' } = options;
  
  const requestBody: Record<string, unknown> = {
    model: model,
    messages: messages,
    max_tokens: 16000
  };
  
  if (tools) {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }
  
  console.log('Chat Completions API Request:', JSON.stringify(requestBody, null, 2).substring(0, 2000));
  
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter Chat Completions API 错误: ${response.status} - ${errorData}`);
  }
  
  const data = await response.json();
  console.log('Chat Completions API Response:', JSON.stringify(data, null, 2).substring(0, 2000));
  
  return parseChatCompletionOutput(data);
}
