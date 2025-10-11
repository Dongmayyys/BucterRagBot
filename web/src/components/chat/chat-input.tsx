'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 聊天输入框组件
 * 
 * 特性：
 * - 多行文本输入 (自动高度调整)
 * - Enter 发送，Shift+Enter 换行
 * - 发送按钮禁用状态
 * - 加载中显示 spinner
 */

interface ChatInputProps {
    onSubmit: (message: string) => void;
    isLoading?: boolean;
    placeholder?: string;
}

export function ChatInput({
    onSubmit,
    isLoading = false,
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
        <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-background/80 backdrop-blur-sm"
        >
            <div className="max-w-3xl mx-auto p-4">
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

                    {/* 发送按钮 */}
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isLoading}
                        className={cn(
                            'h-9 w-9 rounded-xl shrink-0',
                            'bg-primary hover:bg-primary/90',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                {/* 提示文字 */}
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                    按 Enter 发送，Shift + Enter 换行
                </p>
            </div>
        </form>
    );
}
