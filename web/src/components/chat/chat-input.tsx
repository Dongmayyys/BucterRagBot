'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { Send, Square, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 聊天输入框组件
 * 
 * 特性：
 * - 多行文本输入 (自动高度调整)
 * - Enter 发送，Shift+Enter 换行
 * - 发送/停止按钮切换（在输入框内）
 * - 清除按钮（圆形扫帚图标，外置居中）
 */

interface ChatInputProps {
    onSubmit: (message: string) => void;
    onClear?: () => void;
    onStop?: () => void;
    isLoading?: boolean;
    showClearButton?: boolean;
    placeholder?: string;
}

export function ChatInput({
    onSubmit,
    onClear,
    onStop,
    isLoading = false,
    showClearButton = false,
    placeholder = '输入你的问题...',
}: ChatInputProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 自动调整高度
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    }, [input]);

    // 提交处理
    const handleSubmit = (e?: FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        onSubmit(trimmed);
        setInput('');

        // 重置高度
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    // 键盘事件：Enter 发送，Shift+Enter 换行
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto p-4">
                {/* 输入区域：清除按钮 + 输入框 */}
                <div className="flex items-center gap-3">
                    {/* 清除按钮 - 圆形外置，始终占位避免抖动 */}
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onClear}
                        disabled={isLoading || !showClearButton}
                        className={cn(
                            "h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive cursor-pointer transition-opacity",
                            showClearButton ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                        title="清除对话"
                    >
                        <Eraser className="h-4 w-4" />
                    </Button>

                    {/* 输入框容器 */}
                    <form onSubmit={handleSubmit} className="flex-1">
                        <div
                            className={cn(
                                'flex items-end gap-2 rounded-2xl border bg-muted/30 p-2 transition-all',
                                'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20'
                            )}
                        >
                            {/* 文本输入框 */}
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                disabled={isLoading}
                                rows={1}
                                className={cn(
                                    'flex-1 resize-none bg-transparent px-2 py-1.5',
                                    'text-sm placeholder:text-muted-foreground',
                                    'focus:outline-none disabled:opacity-50',
                                    'min-h-[36px] max-h-[200px]'
                                )}
                            />

                            {/* 发送/停止按钮 - 在输入框内 */}
                            {isLoading ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="destructive"
                                    onClick={onStop}
                                    className="h-9 w-9 rounded-xl shrink-0 cursor-pointer"
                                    title="停止生成"
                                >
                                    <Square className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!input.trim()}
                                    className={cn(
                                        'h-9 w-9 rounded-xl shrink-0 cursor-pointer',
                                        'bg-primary hover:bg-primary/90',
                                        'disabled:opacity-50 disabled:cursor-not-allowed'
                                    )}
                                    title="发送消息"
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </form>
                </div>

                {/* 提示文字 */}
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                    内容仅供参考，请注意时效性并核实来源
                </p>
            </div>
        </div>
    );
}
