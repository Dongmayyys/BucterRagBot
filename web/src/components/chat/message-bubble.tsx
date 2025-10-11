'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/lib/types';
import { SourceBubble } from './source-bubble';

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
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div
            className={cn(
                'flex gap-3 w-full',
                isUser ? 'justify-end' : 'justify-start'
            )}
        >
            {/* AI 头像 (左侧) */}
            {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                    <Bot className="w-4 h-4 text-white" />
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
                    // AI 消息：Markdown 渲染
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                // 自定义表格样式
                                table: ({ children }) => (
                                    <div className="overflow-x-auto my-2">
                                        <table className="min-w-full text-xs">{children}</table>
                                    </div>
                                ),
                                // 自定义代码块样式
                                code: ({ children, className }) => {
                                    const isInline = !className;
                                    return isInline ? (
                                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                            {children}
                                        </code>
                                    ) : (
                                        <code className={className}>{children}</code>
                                    );
                                },
                                // 自定义链接样式
                                a: ({ children, href }) => (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary underline underline-offset-2 hover:text-primary/80"
                                    >
                                        {children}
                                    </a>
                                ),
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                    </div>
                )}

                {/* 流式输出时的光标动画 */}
                {isStreaming && !isUser && (
                    <span className="inline-block w-2 h-4 ml-1 bg-foreground/50 animate-pulse rounded-sm" />
                )}

                {/* 引用来源卡片 (仅 AI 消息) */}
                {!isUser && message.citations && message.citations.length > 0 && (
                    <SourceBubble citations={message.citations} />
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
}
