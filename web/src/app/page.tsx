'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatLayout } from '@/components/chat/chat-layout';
import { ChatList } from '@/components/chat/chat-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessage, Citation } from '@/lib/types';
import { ProcessingPhase } from '@/components/chat/processing-steps';

/**
 * 主页面 - 聊天界面
 * 
 * 数据流：
 * 1. 用户输入 → ChatInput → sendMessage()
 * 2. sendMessage() → fetch('/api/chat') → 流式响应
 * 3. 解析响应：先提取 citations，再渲染 LLM 文本
 * 4. setMessages() → ChatList → MessageBubble → SourceBubble
 * 5. 点击引用 → setSelectedCitation → SourcePanel 显示详情
 * 6. 点击停止 → abortController.abort() → 终止流式输出
 * 7. phase 状态追踪 RAG 处理阶段（searching → organizing → generating → done）
 */

// 分隔符常量
const STREAM_SEPARATOR = '---STREAM_START---';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [hasResults, setHasResults] = useState(true); // 是否找到了 citations

  // 用于终止请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 核心发送逻辑
   * @param content 消息内容
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);
    setPhase('searching'); // 阶段 1：查找资料

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 1. 添加用户消息
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 2. 添加空的 assistant 消息（用于流式填充）
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      // 3. 构建请求体（AI SDK v5 UIMessage 格式）
      const uiMessages = [...messages, userMessage].map(msg => ({
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      }));

      // 4. 发送请求（带 signal 用于终止）
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: uiMessages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // 5. 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      setPhase('organizing'); // 阶段 2：整理资料（收到响应）

      const decoder = new TextDecoder();
      let buffer = '';           // 累积缓冲区
      let citations: Citation[] = [];  // 解析出的 citations
      let streamStarted = false; // 是否已经开始接收 LLM 文本

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 6. 检测分隔符，提取 citations
        if (!streamStarted && buffer.includes(STREAM_SEPARATOR)) {
          const [jsonPart, rest] = buffer.split(STREAM_SEPARATOR);

          // 解析 citations JSON
          try {
            const parsed = JSON.parse(jsonPart.trim());
            citations = parsed.citations || [];
            console.log('[Frontend] Parsed citations:', citations.length);
            setHasResults(citations.length > 0); // 设置是否找到了结果
          } catch (e) {
            console.error('[Frontend] Failed to parse citations:', e);
            setHasResults(false);
          }

          // 重置 buffer 为分隔符后的内容
          buffer = rest?.trim() || '';
          streamStarted = true;
          setPhase('generating'); // 阶段 3：生成回复（LLM 开始输出）
        }

        // 7. 更新 assistant 消息（仅在流开始后）
        if (streamStarted) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: buffer, citations }
                : msg
            )
          );
        }
      }

      setPhase('done'); // 完成
    } catch (err) {
      // 检查是否是用户主动取消
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Frontend] Request aborted by user');
        setPhase('done');
        // 不移除消息，保留已生成的内容
        return;
      }

      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('idle');
      // 移除空的 assistant 消息
      setMessages(prev => prev.filter(msg => msg.id !== assistantId));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, messages]);

  /**
   * 停止生成
   */
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /**
   * 清除对话历史（同时终止 LLM 输出）
   */
  const handleClear = useCallback(() => {
    // 先终止正在进行的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setSelectedCitation(null);
    setError(null);
    setIsLoading(false);
    setPhase('idle');
  }, []);

  /**
   * 点击引用来源
   */
  const handleCitationClick = useCallback((citation: Citation) => {
    setSelectedCitation(citation);
  }, []);

  return (
    <ChatLayout
      selectedCitation={selectedCitation}
      onCloseCitation={() => setSelectedCitation(null)}
      onNewChat={handleClear}
      hasMessages={messages.length > 0}
    >
      {/* 消息列表 */}
      <ChatList
        messages={messages}
        isLoading={isLoading}
        phase={phase}
        hasResults={hasResults}
        onSuggestionClick={sendMessage}
        onCitationClick={handleCitationClick}
      />

      {/* 错误提示 */}
      {error && (
        <div className="text-center text-destructive text-sm py-2 px-4 bg-destructive/10 rounded-lg mx-4 mb-2">
          发生错误: {error}
        </div>
      )}

      {/* 输入框组件 */}
      <ChatInput
        onSubmit={sendMessage}
        onStop={handleStop}
        isLoading={isLoading}
      />
    </ChatLayout>
  );
}
