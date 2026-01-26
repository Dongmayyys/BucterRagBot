'use client';

import { useLayoutEffect, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatMessage, Citation, SuggestionCard, DEFAULT_SUGGESTIONS, EASTER_EGG_SUGGESTIONS, NIGHT_OWL_SUGGESTIONS } from '@/lib/types';
import { MessageBubble } from './message-bubble';
import { ProcessingPhase } from './processing-steps';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { useTypewriterWithTransition, getTimeOfDay, getGreeting, getSubtitle, TimeOfDay } from '@/hooks/use-typewriter';

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

// 🔧 调试开关：设为 false 关闭调试区域（生产构建自动移除）
const DEBUG_UI = false;

export function ChatList({ messages, isLoading, phase = 'idle', hasResults = true, isChat = false, onSuggestionClick, onCitationClick }: ChatListProps) {
    // 智能滚底 Hook
    const [containerRef, endRef, isAtBottom, scrollToBottom, hasUnread, markUnread] = useScrollToBottom<HTMLDivElement>(isLoading);

    // 💡 事件驱动
    // - isLoading: false → true（用户发送消息）：滚到底部
    // - isLoading: true → false（回复完毕）：标记未读
    const prevLoadingRef = useRef(isLoading);
    useLayoutEffect(() => {
        if (!prevLoadingRef.current && isLoading) {
            // 用户发送消息，滚到底部
            scrollToBottom();
        }
        if (prevLoadingRef.current && !isLoading) {
            // streaming 结束，标记未读
            markUnread();
        }
        prevLoadingRef.current = isLoading;
    }, [isLoading, markUnread, scrollToBottom]);

    // 获取问候语（仅在组件挂载时计算一次）
    const timeOfDay = useMemo(() => getTimeOfDay(), []);
    const greeting = useMemo(() => getGreeting(timeOfDay), [timeOfDay]);
    const subtitle = useMemo(() => getSubtitle(timeOfDay), [timeOfDay]);

    // 彩蛋欢迎语
    const easterEggGreeting = 'Welcome to BUCT';
    const easterEggSubtitle = 'You found a hidden easter egg!';

    // 打字机效果（支持切换）
    const { displayText, isTyping, isDeleting, transitionTo } = useTypewriterWithTransition(greeting, 80);

    // 彩蛋状态
    const [isEasterEgg, setIsEasterEgg] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const lastClickTimeRef = useRef<number>(0);  // 记录最后点击时间

    // 时间段 Emoji 映射
    const timeEmoji = useMemo(() => {
        const emojiMap: Record<TimeOfDay, string> = {
            morning: '☀️',
            afternoon: '☕',
            evening: '🌙',
            night: '🦉',
        };
        return emojiMap[timeOfDay];
    }, [timeOfDay]);

    // 当前显示的 Emoji（彩蛋模式不显示）
    const currentEmoji = isEasterEgg ? '' : timeEmoji;

    // 点击动效配置（使用 Web Animations API）
    const getClickAnimation = useCallback((emoji: string): KeyframeAnimationOptions & { keyframes: Keyframe[] } => {
        const animations: Record<string, { keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = {
            '☀️': {  // 太阳：旋转 + 放大
                keyframes: [
                    { transform: 'scale(1) rotate(0deg)' },
                    { transform: 'scale(1.3) rotate(180deg)' },
                    { transform: 'scale(1) rotate(360deg)' },
                ],
                options: { duration: 600, easing: 'ease-out' },
            },
            '☕': {  // 咖啡：上下晃动
                keyframes: [
                    { transform: 'translateY(0) rotate(0deg)' },
                    { transform: 'translateY(-4px) rotate(-10deg)' },
                    { transform: 'translateY(-4px) rotate(10deg)' },
                    { transform: 'translateY(0) rotate(0deg)' },
                ],
                options: { duration: 500, easing: 'ease-in-out' },
            },
            '🌙': {  // 月亮：左右摇摆
                keyframes: [
                    { transform: 'rotate(0deg)' },
                    { transform: 'rotate(-15deg)' },
                    { transform: 'rotate(15deg)' },
                    { transform: 'rotate(0deg)' },
                ],
                options: { duration: 500, easing: 'ease-in-out' },
            },
            '🦉': {  // 猫头鹰：左右看
                keyframes: [
                    { transform: 'scaleX(1)' },
                    { transform: 'scaleX(-1)' },
                    { transform: 'scaleX(1)' },
                ],
                options: { duration: 400, easing: 'ease-in-out' },
            },
            '❤️': {  // 爱心：心跳
                keyframes: [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.2)' },
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.2)' },
                    { transform: 'scale(1)' },
                ],
                options: { duration: 600, easing: 'ease-in-out' },
            },
            '❓': {  // 问号：心跳
                keyframes: [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.2)' },
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.2)' },
                    { transform: 'scale(1)' },
                ],
                options: { duration: 600, easing: 'ease-in-out' },
            },
        };
        const defaultAnim = {  // 空闲：轻微抖动
            keyframes: [
                { transform: 'rotate(0deg)' },
                { transform: 'rotate(-5deg)' },
                { transform: 'rotate(5deg)' },
                { transform: 'rotate(0deg)' },
            ],
            options: { duration: 500, easing: 'ease-in-out' },
        };
        const anim = animations[emoji] || defaultAnim;
        return { keyframes: anim.keyframes, ...anim.options };
    }, []);

    // 时间段渐变色映射
    const gradientClass = useMemo(() => {
        if (isEasterEgg) return 'from-pink-500 to-red-500';  // 彩蛋模式用粉红
        const gradientMap: Record<TimeOfDay, string> = {
            morning: 'from-orange-500 to-amber-500',
            afternoon: 'from-amber-600 to-orange-600',
            evening: 'from-violet-600 to-purple-600',
            night: 'from-indigo-600 to-blue-600',
        };
        return gradientMap[timeOfDay];
    }, [timeOfDay, isEasterEgg]);

    // 光标颜色映射（与渐变色保持一致）
    const cursorColor = useMemo(() => {
        if (isEasterEgg) return 'bg-pink-500';
        const colorMap: Record<TimeOfDay, string> = {
            morning: 'bg-orange-500',
            afternoon: 'bg-amber-600',
            evening: 'bg-violet-600',
            night: 'bg-indigo-600',
        };
        return colorMap[timeOfDay];
    }, [timeOfDay, isEasterEgg]);

    // 当前显示的建议气泡（彩蛋 > 夜猫子 > 默认）
    const currentSuggestions = useMemo(() => {
        if (isEasterEgg) return EASTER_EGG_SUGGESTIONS;
        if (timeOfDay === 'night') return NIGHT_OWL_SUGGESTIONS;
        return DEFAULT_SUGGESTIONS;
    }, [isEasterEgg, timeOfDay]);

    // 点击 Emoji 处理
    const handleEmojiClick = useCallback(() => {
        // 播放点击动效（使用 Web Animations API）
        console.log('[EasterEgg] Click! emoji:', currentEmoji);

        if (emojiButtonRef.current) {
            const { keyframes, ...options } = getClickAnimation(currentEmoji);
            emojiButtonRef.current.animate(keyframes, options);
            lastClickTimeRef.current = Date.now();  // 记录点击时间
        }

        // 累加点击计数（使用函数式更新避免闭包问题）
        setClickCount(prev => {
            const newCount = prev + 1;
            console.log('[EasterEgg] clickCount:', newCount);

            // 检测彩蛋
            if (newCount >= 5 && !isEasterEgg) {
                setIsEasterEgg(true);
                transitionTo(easterEggGreeting);
                return 0;  // 重置
            }
            return newCount;
        });
    }, [getClickAnimation, currentEmoji, isEasterEgg, transitionTo]);

    // 空闲动效配置
    const idleAnimation = useMemo(() => ({
        keyframes: [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-5deg)' },
            { transform: 'rotate(5deg)' },
            { transform: 'rotate(0deg)' },
        ],
        options: { duration: 500, easing: 'ease-in-out' } as KeyframeAnimationOptions,
    }), []);

    // 空闲时自动播放动效
    useEffect(() => {
        if (isTyping || isDeleting) return;  // 打字过程中不播放

        const playIdleAnim = () => {
            // 点击后 1 秒内跳过空闲动效，避免冲突
            if (Date.now() - lastClickTimeRef.current < 1000) return;

            if (emojiButtonRef.current) {
                emojiButtonRef.current.animate(idleAnimation.keyframes, idleAnimation.options);
            }
        };

        // 每 5 秒播放一次
        idleTimerRef.current = setInterval(playIdleAnim, 5000);

        return () => {
            if (idleTimerRef.current) clearInterval(idleTimerRef.current);
        };
    }, [isTyping, isDeleting, idleAnimation]);

    // 空状态：展示欢迎语和建议卡片
    if (messages.length === 0 && !isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 overflow-auto">
                {/* 欢迎标题 */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl sm:text-6xl font-bold mb-4 h-16 sm:h-20 flex items-center justify-center gap-3">
                        <span className={`bg-gradient-to-r ${gradientClass} bg-clip-text text-transparent`}>
                            {displayText}
                        </span>
                        {(isTyping || isDeleting) ? (
                            <span className={`inline-block w-1 sm:w-1.5 h-8 sm:h-12 ${cursorColor} animate-pulse rounded-full`} />
                        ) : (
                            currentEmoji && (
                            <button
                                ref={emojiButtonRef}
                                onClick={handleEmojiClick}
                                className="text-4xl sm:text-5xl cursor-pointer inline-block hover:scale-110 transition-transform"
                                style={{ transformOrigin: 'center' }}
                            >
                                {currentEmoji}
                            </button>
                            )
                        )}
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-xl">
                        {isEasterEgg ? easterEggSubtitle : subtitle}
                    </p>
                </div>

                {/* 🔧 调试区域 - 所有时间段预览 + 动效测试 */}
                {process.env.NODE_ENV === 'development' && DEBUG_UI && (
                    <div className="w-full max-w-lg mb-8 p-4 border border-dashed border-muted-foreground/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-3 text-center">🔧 调试预览 - 生产环境自动移除</p>
                        <div className="space-y-3">
                            <div className="text-2xl font-bold flex items-center gap-2 justify-center">
                                <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">早上好，巴克特</span>
                                <button className="emoji-click-sun hover:scale-110 transition-transform" title="点击测试动效">☀️</button>
                            </div>
                            <div className="text-2xl font-bold flex items-center gap-2 justify-center">
                                <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">下午好，巴克特</span>
                                <button className="emoji-click-coffee hover:scale-110 transition-transform" title="点击测试动效">☕</button>
                            </div>
                            <div className="text-2xl font-bold flex items-center gap-2 justify-center">
                                <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">晚上好，巴克特</span>
                                <button className="emoji-click-moon hover:scale-110 transition-transform" title="点击测试动效">🌙</button>
                            </div>
                            <div className="text-2xl font-bold flex items-center gap-2 justify-center">
                                <span className="bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">Hi, Bucter</span>
                                <button className="emoji-click-owl hover:scale-110 transition-transform" title="点击测试动效">🦉</button>
                            </div>
                            <div className="text-2xl font-bold flex items-center gap-2 justify-center">
                                <span className="bg-gradient-to-r from-pink-500 to-red-500 bg-clip-text text-transparent">I ❤️ BUCT</span>
                                <button className="emoji-click-heart hover:scale-110 transition-transform" title="点击测试动效">❓</button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3 text-center">动效会在页面刷新后播放一次</p>
                    </div>
                )}

                {/* 建议卡片网格 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                    {currentSuggestions.map((suggestion, idx) => (
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
