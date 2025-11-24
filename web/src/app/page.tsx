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
 * 数据流（四阶段）：
 * 1. 用户输入 → thinking（意图分类）
 * 2. 如果是 query → searching → organizing → generating
 * 3. 如果是 chat → 跳过 searching/organizing → generating
 * 4. 完成 → done
 */

// 分隔符常量
const STREAM_SEPARATOR = '---STREAM_START---';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [hasResults, setHasResults] = useState(true);
  const [isChat, setIsChat] = useState(false); // 是否为闲聊模式

  // 用于终止请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 核心发送逻辑
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);
    setPhase('thinking'); // ★ 阶段 1：思考（意图分类）
    setIsChat(false);
    setHasResults(true);

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
      // 3. 构建请求体
      const uiMessages = [...messages, userMessage].map(msg => ({
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      }));

      // 4. 发送请求
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

      const decoder = new TextDecoder();
      let buffer = '';
      let citations: Citation[] = [];
      let streamStarted = false;
      let intent: 'query' | 'chat' = 'query';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 6. 检测分隔符，提取 intent + citations
        if (!streamStarted && buffer.includes(STREAM_SEPARATOR)) {
          const [jsonPart, rest] = buffer.split(STREAM_SEPARATOR);

          try {
            const parsed = JSON.parse(jsonPart.trim());
            intent = parsed.intent || 'query';
            citations = parsed.citations || [];
            console.log('[Frontend] Intent:', intent, 'Citations:', citations.length);

            setIsChat(intent === 'chat');
            setHasResults(citations.length > 0);

            // ★ 根据意图设置阶段
            if (intent === 'chat') {
              // 闲聊：跳过查询和整理，直接进入生成
              setPhase('generating');
            } else if (citations.length === 0) {
              // 无检索结果：跳过动画，直接 done（避免 setTimeout 时序问题）
              setPhase('done');
            } else {
              // 知识查询：显示查询阶段完成，进入整理（后端已完成，这里模拟进度）
              setPhase('searching');
              setTimeout(() => setPhase('organizing'), 100);
              setTimeout(() => setPhase('generating'), 200);
            }
          } catch (e) {
            console.error('[Frontend] Failed to parse header:', e);
            setHasResults(false);
          }

          buffer = rest?.trim() || '';
          streamStarted = true;
        }

        // 7. 更新 assistant 消息
        if (streamStarted) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: buffer, citations: intent === 'query' ? citations : undefined }
                : msg
            )
          );
        }
      }

      setPhase('done');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Frontend] Request aborted by user');
        setPhase('done');
        return;
      }

      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('idle');
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
   * 清除对话历史
   */
  const handleClear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setSelectedCitation(null);
    setError(null);
    setIsLoading(false);
    setPhase('idle');
    setIsChat(false);
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
        isChat={isChat}
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
