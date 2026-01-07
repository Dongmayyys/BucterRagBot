'use client';

import { Plus, Sun, Upload, Heart, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState, useEffect } from 'react';

interface ChatHeaderProps {
    onNewChat?: () => void;
    hasMessages?: boolean;
    onShowCredits?: () => void;
}

export function ChatHeader({ onNewChat, hasMessages = false, onShowCredits }: ChatHeaderProps) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const actionButtons = [
        { icon: Sun, label: '主题切换', onClick: () => { }, disabled: true },
        { icon: Upload, label: '上传资料', onClick: () => { }, disabled: true },
        { icon: Heart, label: '致谢名单', onClick: onShowCredits, disabled: false },
    ];

    return (
        <header className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-sm">
            {/* 左侧：新对话按钮 */}
            <Button
                variant="outline"
                size="sm"
                onClick={onNewChat}
                disabled={!hasMessages}
                className="gap-1.5"
            >
                <Plus className="h-4 w-4" />
                <span>新对话</span>
            </Button>

            {/* 中间：标题 */}
            <h1 className="font-semibold text-lg absolute left-1/2 -translate-x-1/2">校园智能问答</h1>

            {/* 右侧：功能按钮 */}
            {isMobile ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {actionButtons.map((btn, idx) => (
                            <DropdownMenuItem
                                key={idx}
                                onClick={btn.onClick}
                                disabled={btn.disabled}
                                className="gap-2"
                            >
                                <btn.icon className="h-4 w-4" />
                                <span>{btn.label}</span>
                                {btn.disabled && <span className="text-xs text-muted-foreground ml-auto">开发中</span>}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <div className="flex items-center gap-1">
                    {actionButtons.map((btn, idx) => (
                        <Button
                            key={idx}
                            variant="ghost"
                            size="icon"
                            onClick={btn.onClick}
                            disabled={btn.disabled}
                            title={btn.disabled ? `${btn.label}（开发中）` : btn.label}
                        >
                            <btn.icon className="h-5 w-5" />
                        </Button>
                    ))}
                </div>
            )}
        </header>
    );
}
