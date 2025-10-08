'use client';

import { useState, useCallback } from 'react';
import { ChatLayout } from '@/components/chat/chat-layout';
import { ChatList } from '@/components/chat/chat-list';
import { ChatMessage } from '@/lib/types';
import { Send, Loader2 } from 'lucide-react';

/**
 * 主页面 - 聊天界面
 * 
 * 使用简单的 fetch + ReadableStream 处理流式输出
 * （暂时不使用 AI SDK 的 useChat，以排除问题）
 */

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 核心发送逻辑 - 只关心"发什么内容"
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 添加一个空的 assistant 消息用于流式填充
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      // 构建请求体 (AI SDK v5 UIMessage 格式)
      const uiMessages = [...messages, userMessage].map(msg => ({
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: uiMessages }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // 读取流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let fullContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        // 更新 assistant 消息
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

  // 表单提交入口 - 从 input 状态读取内容
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content) return;
    setInput(''); // 立即清空输入框
    sendMessage(content);
  }, [input, sendMessage]);

  // 建议卡片点击入口 - 直接使用参数
  const handleSuggestionClick = useCallback((query: string) => {
    sendMessage(query);
  }, [sendMessage]);

  return (
    <ChatLayout>
      {/* 消息列表 */}
      <ChatList
        messages={messages}
        isLoading={isLoading}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* 错误提示 */}
      {error && (
        <div className="text-center text-destructive text-sm py-2 px-4 bg-destructive/10 rounded-lg mx-4 mb-2">
          发生错误: {error}
        </div>
      )}

      {/* 输入框 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-background/80 backdrop-blur-sm"
      >
        <div className="max-w-3xl mx-auto p-4">
          <div className="flex items-end gap-2 rounded-2xl border bg-muted/30 p-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="输入你的问题..."
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[36px] max-h-[200px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 rounded-xl shrink-0 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-primary-foreground"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            按 Enter 发送，Shift + Enter 换行
          </p>
        </div>
      </form>
    </ChatLayout>
  );
}
