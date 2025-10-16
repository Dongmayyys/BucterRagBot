'use client';

import { useState, useCallback } from 'react';
import { ChatLayout } from '@/components/chat/chat-layout';
import { ChatList } from '@/components/chat/chat-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessage } from '@/lib/types';

/**
 * 主页面 - 聊天界面
 * 
 * 数据流：
 * 1. 用户输入 → ChatInput → sendMessage()
 * 2. sendMessage() → fetch('/api/chat') → 流式响应
 * 3. 流式响应 → setMessages() → ChatList 渲染
 */

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 核心发送逻辑
   * @param content 消息内容
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

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

      // 4. 发送请求
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: uiMessages }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // 5. 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullContent += decoder.decode(value, { stream: true });

        // 6. 更新 assistant 消息
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantId ? { ...msg, content: fullContent } : msg
          )
        );
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // 移除空的 assistant 消息
      setMessages(prev => prev.filter(msg => msg.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  return (
    <ChatLayout>
      {/* 消息列表 */}
      <ChatList
        messages={messages}
        isLoading={isLoading}
        onSuggestionClick={sendMessage}
      />

      {/* 错误提示 */}
      {error && (
        <div className="text-center text-destructive text-sm py-2 px-4 bg-destructive/10 rounded-lg mx-4 mb-2">
          发生错误: {error}
        </div>
      )}

      {/* 输入框组件 */}
      <ChatInput onSubmit={sendMessage} isLoading={isLoading} />
    </ChatLayout>
  );
}
