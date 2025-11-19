'use client';

import { useLayoutEffect, useRef } from 'react';
import { Sparkles, ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessage, Citation, SuggestionCard, DEFAULT_SUGGESTIONS } from '@/lib/types';
import { MessageBubble } from './message-bubble';
import { ProcessingPhase } from './processing-steps';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';

/**
 * 消息列表容器
 * 
 * 职责：
 * - 渲染所有消息气泡
 * - 自动滚动到底部
 * - 空状态时展示建议卡片
 * - 加载中显示骨架屏
 */

interface ChatListProps {
    messages: ChatMessage[];
    isLoading?: boolean;
    phase?: ProcessingPhase;
    hasResults?: boolean;
    isChat?: boolean;
    onSuggestionClick?: (query: string) => void;
    onCitationClick?: (citation: Citation) => void;
}

export function ChatList({ messages, isLoading, phase = 'idle', hasResults = true, isChat = false, onSuggestionClick, onCitationClick }: ChatListProps) {
    // 智能滚底 Hook
    const [containerRef, endRef, isAtBottom, scrollToBottom, hasUnread, markUnread] = useScrollToBottom<HTMLDivElement>(isLoading);

    // 💡 事件驱动：isLoading 从 true → false 时，调用 markUnread
    // 使用 useLayoutEffect 确保在渲染前同步更新，避免按钮闪烁
    const prevLoadingRef = useRef(isLoading);
    useLayoutEffect(() => {
        if (prevLoadingRef.current && !isLoading) {
            // streaming 结束，标记未读
            markUnread();
        }
        prevLoadingRef.current = isLoading;
    }, [isLoading, markUnread]);

    // 空状态：展示欢迎语和建议卡片
    if (messages.length === 0 && !isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 overflow-auto">
                {/* 欢迎标题 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg mb-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold text-foreground mb-2">
                        校园智能问答
                    </h1>
                    <p className="text-muted-foreground max-w-md">
                        我可以帮你查询校园相关信息，包括学生手册、教务规定等
                    </p>
                </div>

                {/* 建议卡片网格 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                    {DEFAULT_SUGGESTIONS.map((suggestion, idx) => (
                        <SuggestionButton
                            key={idx}
                            suggestion={suggestion}
                            onClick={() => onSuggestionClick?.(suggestion.query)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex-1 overflow-y-auto px-4 custom-scrollbar relative">
            {/* endRef 绑定到内容 div，ResizeObserver 监听其高度变化 */}
            <div ref={endRef} className="max-w-3xl mx-auto py-6 space-y-6">
                {/* 渲染所有消息 */}
                {messages.map((message, idx) => {
                    const isLastAssistant = idx === messages.length - 1 && message.role === 'assistant';
                    return (
                        <MessageBubble
                            key={message.id || idx}
                            message={message}
                            isStreaming={isLoading && isLastAssistant}
                            phase={isLastAssistant ? phase : 'idle'}
                            hasResults={hasResults}
                            isChat={isChat}
                            onCitationClick={onCitationClick}
                        />
                    );
                })}

                {/* 加载中：骨架屏 */}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <LoadingSkeleton />
                )}
            </div>

            {/* 新消息浮动按钮 - 生成中或有未读消息时显示 */}
            {(isLoading || hasUnread) && !isAtBottom && (
                <div className="sticky bottom-4 w-full flex justify-center pointer-events-none">
                    <button
                        onClick={scrollToBottom}
                        className="flex items-center gap-2 px-4 py-2 rounded-full
                                   bg-primary text-primary-foreground shadow-lg
                                   hover:bg-primary/90 transition-all
                                   animate-bounce pointer-events-auto"
                        aria-label="滚动到底部"
                    >
                        <ArrowDown className="w-4 h-4" />
                        <span className="text-sm font-medium">新消息</span>
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * 建议卡片按钮
 */
function SuggestionButton({
    suggestion,
    onClick,
}: {
    suggestion: SuggestionCard;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-3 p-4 rounded-xl
                 border border-border/50 bg-muted/30
                 hover:bg-muted hover:border-border
                 transition-all duration-200 text-left
                 group"
        >
            <span className="text-2xl">{suggestion.emoji}</span>
            <div>
                <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                    {suggestion.title}
                </div>
                <div className="text-xs text-muted-foreground">
                    {suggestion.query}
                </div>
            </div>
        </button>
    );
}

/**
 * AI 思考中骨架屏
 */
function LoadingSkeleton() {
    return (
        <div className="flex gap-3">
            {/* AI 头像占位 */}
            <Skeleton className="w-8 h-8 rounded-full" />

            {/* 内容骨架 */}
            <div className="space-y-2 flex-1 max-w-[60%]">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </div>
    );
}
