'use client';

import { useLayoutEffect, useRef, useMemo } from 'react';
import { ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessage, Citation, SuggestionCard, DEFAULT_SUGGESTIONS, EASTER_EGG_SUGGESTIONS, NIGHT_OWL_SUGGESTIONS } from '@/lib/types';
import { MessageBubble } from './message-bubble';
import { ProcessingPhase } from './processing-steps';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { useTypewriterWithTransition, getTimeOfDay } from '@/hooks/use-typewriter';
import { useEasterEgg, EASTER_EGG_GREETING } from '@/hooks/use-easter-egg';

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
    // 彩蛋状态控制（提升到父组件以控制输入框显隐）
    isEasterEgg?: boolean;
    onEasterEggChange?: (isActive: boolean) => void;
}

// 🔧 调试开关：设为 false 关闭调试区域（生产构建自动移除）
const DEBUG_UI = false;

export function ChatList({
    messages,
    isLoading,
    phase = 'idle',
    hasResults = true,
    isChat = false,
    onSuggestionClick,
    onCitationClick,
    isEasterEgg: propIsEasterEgg,
    onEasterEggChange
}: ChatListProps) {
    // 智能滚底 Hook
    const [containerRef, endRef, isAtBottom, scrollToBottom, hasUnread, markUnread] = useScrollToBottom<HTMLDivElement>(isLoading);

    // 💡 事件驱动
    const prevLoadingRef = useRef(isLoading);
    useLayoutEffect(() => {
        if (!prevLoadingRef.current && isLoading) {
            scrollToBottom();
        }
        if (prevLoadingRef.current && !isLoading) {
            markUnread();
        }
        prevLoadingRef.current = isLoading;
    }, [isLoading, markUnread, scrollToBottom]);

    // 获取时间段
    const timeOfDay = useMemo(() => getTimeOfDay(), []);

    // 打字机效果
    const { displayText, isTyping, isDeleting, transitionTo } = useTypewriterWithTransition(
        useMemo(() => {
            const greetings = {
                morning: '早上好，巴克特',
                afternoon: '下午好，巴克特',
                evening: '晚上好，巴克特',
                night: 'Night Owl Mode',
            };
            return greetings[timeOfDay];
        }, [timeOfDay]),
        80
    );

    // 🎉 彩蛋 Hook
    const {
        isEasterEgg,
        isMouthOpen,
        currentEmoji,
        subtitle,
        easterEggSubtitle,
        emojiButtonRef,
        monsterRef,
        handleEmojiClick,
        handleMonsterClick,
    } = useEasterEgg({
        timeOfDay,
        isEasterEgg: propIsEasterEgg,
        onEasterEggChange,
        onTrigger: () => transitionTo(EASTER_EGG_GREETING),
    });

    // 当前显示的建议气泡（彩蛋 > 夜猫子 > 默认）
    const currentSuggestions = useMemo(() => {
        if (isEasterEgg) return EASTER_EGG_SUGGESTIONS;
        if (timeOfDay === 'night') return NIGHT_OWL_SUGGESTIONS;
        return DEFAULT_SUGGESTIONS;
    }, [isEasterEgg, timeOfDay]);

    // 空状态：展示欢迎语和建议卡片
    if (messages.length === 0 && !isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-start pt-10 sm:pt-[15vh] px-4 overflow-y-auto custom-scrollbar relative isolation-isolate">
                {/* 背景装饰 - 极简流体光效 */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
                    <div className="absolute top-[20%] left-[15%] w-160 h-160 bg-primary/1 rounded-full blur-[150px] animate-pulse mix-blend-multiply dark:mix-blend-normal" style={{ animationDuration: '8s' }} />
                    <div className="absolute top-[30%] right-[15%] w-140 h-140 bg-blue-500/1 rounded-full blur-[150px] animate-pulse mix-blend-multiply dark:mix-blend-normal" style={{ animationDuration: '10s', animationDelay: '1s' }} />
                </div>

                {/* 欢迎标题 */}
                <div className="text-center mb-12 sm:mb-16 relative z-10 max-w-2xl mx-auto">
                    <div className="mb-6 inline-flex items-center justify-center">
                        <div className="relative">
                            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground flex items-center justify-center gap-3 min-h-12 sm:min-h-16">
                                <span className={isEasterEgg ? "bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent animate-pulse" : ""}>
                                    {displayText}
                                </span>
                                {(isTyping || isDeleting) ? (
                                    <span className="inline-block w-1 sm:w-1.5 h-8 sm:h-12 bg-primary animate-pulse rounded-full" />
                                ) : (
                                    currentEmoji && (
                                        <button
                                            ref={emojiButtonRef}
                                            onClick={handleEmojiClick}
                                            className="text-3xl sm:text-5xl cursor-pointer inline-block hover:scale-110 transition-transform active:scale-95"
                                            style={{ transformOrigin: 'center' }}
                                        >
                                            {currentEmoji}
                                        </button>
                                    )
                                )}
                            </h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground/80 text-lg sm:text-xl font-light tracking-wide">
                        {isEasterEgg ? easterEggSubtitle : subtitle}
                    </p>
                </div>

                {/* 🔧 调试区域 */}
                {process.env.NODE_ENV === 'development' && DEBUG_UI && (
                    <div className="w-full max-w-lg mb-8 p-4 border border-dashed border-muted-foreground/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-3 text-center">🔧 调试预览 - 生产环境自动移除</p>
                    </div>
                )}

                {/* 内容区域 */}
                <div className={`w-full flex items-center justify-center relative z-10 `}>
                    {/* 彩蛋模式：显示怪兽 */}
                    {isEasterEgg ? (
                        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                ref={monsterRef}
                                src={isMouthOpen ? "/monster-open.png" : "/monster.png"}
                                alt="Bucter Monster"
                                className="w-56 h-56 sm:w-64 sm:h-64 object-contain cursor-pointer drop-shadow-2xl hover:-translate-y-2 hover:scale-105 transition-all duration-500 ease-in-out"
                                onClick={handleMonsterClick}
                            />
                            <button
                                className="mt-8 text-lg font-semibold text-primary/80 hover:text-primary underline decoration-dashed decoration-2 decoration-primary/30 underline-offset-8 transition-colors cursor-pointer "
                                onClick={() => onSuggestionClick?.('What is Bucter?')}
                            >
                                What is Bucter?
                            </button>
                        </div>
                    ) : (
                        /* 建议卡片网格 */
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl px-4">
                            {currentSuggestions.map((suggestion, idx) => (
                                <SuggestionButton
                                    key={idx}
                                    suggestion={suggestion}
                                    onClick={() => onSuggestionClick?.(suggestion.query)}
                                />
                            ))}
                        </div>
                    )}
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

                {/* 加载中骨架屏 */}
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
            className="flex items-center gap-4 p-4 rounded-2xl
                 border border-border/40 bg-background/50 backdrop-blur-sm
                 hover:bg-muted/50 hover:border-primary/20 hover:shadow-sm hover:-translate-y-0.5
                 transition-all duration-300 text-left
                 group w-full"
        >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted/50 group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                <span className="text-xl group-hover:rotate-12 transition-transform duration-300">{suggestion.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-foreground/90 group-hover:text-primary transition-colors mb-1 truncate">
                    {suggestion.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate opacity-80 group-hover:opacity-100 transition-opacity">
                    {suggestion.query}
                </p>
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
