'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, BotOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage, Citation } from '@/lib/types';
import { SourceBubble } from './source-bubble';
import { ProcessingSteps, ProcessingPhase } from './processing-steps';

/**
 * 单条消息气泡组件
 * 
 * - 区分 User / AI 样式
 * - AI 消息使用 react-markdown 渲染（支持表格、代码等）
 * - 集成引用来源卡片
 */

interface MessageBubbleProps {
    message: ChatMessage;
    isStreaming?: boolean;  // 是否正在流式输出
    phase?: ProcessingPhase; // RAG 处理阶段
    hasResults?: boolean; // 是否找到了 citation
    isChat?: boolean; // 是否为闲聊模式
    onCitationClick?: (citation: Citation) => void;
}

// Markdown 渲染组件配置（模块级常量，避免每次渲染创建新对象）
const markdownComponents = {
    table: ({ children }: { children?: React.ReactNode }) => (
        <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs">{children}</table>
        </div>
    ),
    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
        const isInline = !className;
        return isInline ? (
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                {children}
            </code>
        ) : (
            <code className={className}>{children}</code>
        );
    },
    a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
            {children}
        </a>
    ),
};

export const MessageBubble = memo(function MessageBubble({ message, isStreaming, phase = 'idle', hasResults = true, isChat = false, onCitationClick }: MessageBubbleProps) {
    // ⚠️ 临时：验证 memo 效果（只有正在输出的消息才应该打印）
    console.log(`[MessageBubble] render: ${message.id}, streaming: ${isStreaming}`);
    const isUser = message.role === 'user';

    return (
        <div
            className={cn(
                'flex gap-3 w-full',
                isUser ? 'justify-end' : 'justify-start'
            )}
            style={isStreaming ? undefined : {
                contentVisibility: 'auto',
                containIntrinsicSize: 'auto 200px',
            }}
        >
            {/* AI 头像 (左侧) */}
            {!isUser && (
                <div className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md',
                    phase === 'error'
                        ? 'bg-gradient-to-br from-red-500 to-rose-600'  // 报错时红色
                        : 'bg-gradient-to-br from-violet-500 to-purple-600'
                )}>
                    {phase === 'error' ? (
                        <BotOff className="w-4 h-4 text-white" />
                    ) : (
                        <Bot className="w-4 h-4 text-white" />
                    )}
                </div>
            )}

            {/* 消息内容 */}
            <div
                className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-3',
                    isUser
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted/50 text-foreground rounded-bl-md border border-border/30'
                )}
            >
                {isUser ? (
                    // 用户消息：纯文本
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.content}
                    </p>
                ) : (
                    // AI 消息：进度指示器 + Markdown 渲染
                    <>
                        {/* RAG 处理流程指示器（done 状态也保留显示） */}
                        {phase !== 'idle' && (
                            <ProcessingSteps phase={phase} hasResults={hasResults} isChat={isChat} />
                        )}
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                            >
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    </>
                )}

                {/* 流式输出时的光标动画 */}
                {isStreaming && !isUser && (
                    <span className="inline-block w-2 h-4 ml-1 bg-foreground/50 animate-pulse rounded-sm" />
                )}

                {/* 引用来源卡片 (仅 AI 消息) */}
                {!isUser && message.citations && message.citations.length > 0 && (
                    <SourceBubble citations={message.citations} onCitationClick={onCitationClick} />
                )}
            </div>

            {/* 用户头像 (右侧) */}
            {isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                    <User className="w-4 h-4 text-white" />
                </div>
            )}
        </div>
    );
});
