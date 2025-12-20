/**
 * 流式 LLM 客户端模块
 * 负责与 OpenRouter API 进行流式交互
 * 
 * 用于 final_response 阶段的 Token 级流式输出
 * 规则：最终回答生成阶段禁止 tool_calls
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { OPENROUTER_API_URL, OPENROUTER_REFERER, OPENROUTER_TITLE, DEBUG_LLM } from '../config.ts';
import type { ChatMessage } from '../types.ts';
import { logStreamDelta, logStreamComplete } from '../logging/agentEvents.ts';

/**
 * 流式输出配置
 */
export interface StreamingConfig {
  flushThresholdChars: number;
  flushThresholdMs: number;
}

/**
 * 默认流式输出配置
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  flushThresholdChars: 200,
  flushThresholdMs: 200
};

/**
 * 流式输出回调
 */
export interface StreamingCallbacks {
  onDelta?: (delta: string, seq: number) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 流式输出结果
 */
export interface StreamingResult {
  content: string;
  finishReason: string | null;
  error?: Error;
}

/**
 * SSE 数据块解析结果
 */
interface SSEChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: {
      content?: string;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
}

/**
 * 解析 SSE 数据行
 */
function parseSSELine(line: string): SSEChunk | null {
  if (!line.startsWith('data: ')) {
    return null;
  }
  
  const data = line.slice(6).trim();
  
  if (data === '[DONE]') {
    return null;
  }
  
  try {
    return JSON.parse(data) as SSEChunk;
  } catch {
    console.warn('[StreamingClient] 解析 SSE 数据失败:', data);
    return null;
  }
}

/**
 * 调用 OpenRouter Chat Completions API（流式）
 * 
 * 用于 final_response 阶段，禁止 tool_calls
 * 实现节流写入 agent_events
 */
export async function callOpenRouterChatCompletionsApiStreaming(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  messageId: string,
  callbacks?: StreamingCallbacks,
  config: StreamingConfig = DEFAULT_STREAMING_CONFIG
): Promise<StreamingResult> {
  const requestBody = {
    model: model,
    messages: messages,
    max_tokens: 16000,
    stream: true
  };
  
  if (DEBUG_LLM) {
    console.log('[StreamingClient] 开始流式请求:', {
      model,
      messageCount: messages.length,
      taskId,
      messageId
    });
  }
  
  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[StreamingClient] 网络请求失败:', err.message);
    callbacks?.onError?.(err);
    return { content: '', finishReason: null, error: err };
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`OpenRouter API 错误: ${response.status} - ${errorText}`);
    console.error('[StreamingClient] API 错误:', err.message);
    callbacks?.onError?.(err);
    return { content: '', finishReason: null, error: err };
  }
  
  if (!response.body) {
    const err = new Error('响应体为空');
    console.error('[StreamingClient] 响应体为空');
    callbacks?.onError?.(err);
    return { content: '', finishReason: null, error: err };
  }
  
  let fullContent = '';
  let finishReason: string | null = null;
  let seq = 0;
  let pendingDelta = '';
  let lastFlushTime = Date.now();
  
  const flushDelta = async () => {
    if (pendingDelta.length === 0) return;
    
    seq++;
    const deltaToFlush = pendingDelta;
    pendingDelta = '';
    lastFlushTime = Date.now();
    
    callbacks?.onDelta?.(deltaToFlush, seq);
    
    await logStreamDelta(supabase, taskId, projectId, deltaToFlush, seq, messageId);
  };
  
  const shouldFlush = () => {
    const now = Date.now();
    return (
      pendingDelta.length >= config.flushThresholdChars ||
      (pendingDelta.length > 0 && now - lastFlushTime >= config.flushThresholdMs)
    );
  };
  
  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        const chunk = parseSSELine(trimmedLine);
        if (!chunk) continue;
        
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        
        if (choice.delta?.content) {
          const delta = choice.delta.content;
          fullContent += delta;
          pendingDelta += delta;
          
          if (shouldFlush()) {
            await flushDelta();
          }
        }
        
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }
    
    if (buffer.trim()) {
      const chunk = parseSSELine(buffer.trim());
      if (chunk?.choices?.[0]?.delta?.content) {
        const delta = chunk.choices[0].delta.content;
        fullContent += delta;
        pendingDelta += delta;
      }
      if (chunk?.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }
    
    await flushDelta();
    
    await logStreamComplete(supabase, taskId, projectId, messageId, fullContent);
    
    callbacks?.onComplete?.(fullContent);
    
    if (DEBUG_LLM) {
      console.log('[StreamingClient] 流式输出完成:', {
        contentLength: fullContent.length,
        totalChunks: seq,
        finishReason
      });
    }
    
    return { content: fullContent, finishReason };
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[StreamingClient] 流式读取错误:', err.message);
    
    await flushDelta();
    
    if (fullContent.length > 0) {
      await logStreamComplete(supabase, taskId, projectId, messageId, fullContent);
    }
    
    callbacks?.onError?.(err);
    return { content: fullContent, finishReason, error: err };
  }
}
