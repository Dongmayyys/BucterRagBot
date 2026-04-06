'use client';

import { useState, useCallback } from 'react';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatContainer } from '@/components/chat/chat-container';
import { MobileSourceSheet } from '@/components/chat/mobile-source-sheet';
import { CreditsDialog } from '@/components/chat/credits-dialog';
import { ChatList } from '@/components/chat/chat-list';
import { ChatInput } from '@/components/chat/chat-input';
import { Citation } from '@/lib/types';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { useChat } from '@/hooks/use-chat';

/**
 * 主页面 — 纯编排层
 *
 * 职责：
 *   - 组合 hooks（useChat + useVisualViewport）
 *   - 管理纯 UI 状态（彩蛋、致谢弹窗）
 *   - 渲染 JSX
 *
 * 不负责：
 *   - 流式请求控制、协议解析、缓冲调度（→ useChat）
 *   - 视口高度管理（→ useVisualViewport）
 */
export default function ChatPage() {
  // ————————————————————————————————————————————
  // Hooks
  // ————————————————————————————————————————————

  const {
    messages,
    isLoading,
    error,
    phase,
    isChat,
    hasResults,
    selectedCitation,
    setSelectedCitation,
    send,
    stop,
    clear,
  } = useChat();

  // 可视视口高度（解决移动端键盘覆盖问题）
  useVisualViewport();

  // ————————————————————————————————————————————
  // 纯 UI 状态（不属于对话逻辑，留在编排层）
  // ————————————————————————————————————————————

  const [isEasterEgg, setIsEasterEgg] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  // ————————————————————————————————————————————
  // 编排方法
  // ————————————————————————————————————————————

  /** 发送消息：退出彩蛋模式 + 委托 useChat */
  const handleSend = useCallback((content: string) => {
    setIsEasterEgg(false);
    send(content);
  }, [send]);

  /** 点击引用来源 */
  const handleCitationClick = useCallback((citation: Citation) => {
    setSelectedCitation(citation);
  }, [setSelectedCitation]);

  // ————————————————————————————————————————————
  // 渲染
  // ————————————————————————————————————————————

  return (
    <div
      className="flex flex-col bg-background"
      style={{ height: 'var(--visual-viewport-height, 100vh)' }}
    >
      {/* 顶部标题栏 */}
      <ChatHeader
        onNewChat={clear}
        hasMessages={messages.length > 0}
        onShowCredits={() => setShowCredits(true)}
      />

      {/* 聊天区域 + 溯源面板 */}
      <ChatContainer
        citation={selectedCitation}
        onCloseCitation={() => setSelectedCitation(null)}
      >
        <ChatList
          messages={messages}
          isLoading={isLoading}
          phase={phase}
          hasResults={hasResults}
          isChat={isChat}
          onSuggestionClick={handleSend}
          onCitationClick={handleCitationClick}
          isEasterEgg={isEasterEgg}
          onEasterEggChange={setIsEasterEgg}
        />
      </ChatContainer>

      {/* 错误提示 */}
      {error && (
        <div className="text-center text-destructive text-sm py-2 px-4 bg-destructive/10 rounded-lg mx-4 mb-2">
          发生错误: {error}
        </div>
      )}

      {/* 输入框组件（彩蛋模式下隐藏） */}
      {!isEasterEgg && (
        <ChatInput
          onSubmit={handleSend}
          onStop={stop}
          isLoading={isLoading}
        />
      )}

      {/* 移动端：溯源弹窗（底部 Sheet）*/}
      <MobileSourceSheet
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />

      {/* 致谢弹窗 */}
      <CreditsDialog
        open={showCredits}
        onOpenChange={setShowCredits}
      />
    </div>
  );
}
