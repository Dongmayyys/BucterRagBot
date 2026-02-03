'use client';

import { Plus, Sun, Upload, Heart, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
    onNewChat?: () => void;
    hasMessages?: boolean;
    onShowCredits?: () => void;
}

export function ChatHeader({ onNewChat, hasMessages = false, onShowCredits }: ChatHeaderProps) {
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
                <span className="hidden md:inline">新对话</span>
            </Button>

            {/* 中间：标题 */}
            {/* 中间：标题 */}
            {/* 中间：标题 */}
            <div className="absolute left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/40 bg-muted/20 backdrop-blur-md shadow-sm select-none transition-colors hover:bg-muted/30 hover:border-border/60">
                    <span className="text-sm font-medium text-foreground/90 tracking-wide">
                        巴克特的北化生存指南
                    </span>
                    <div className="hidden sm:flex h-4 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[9px] font-bold text-primary ring-1 ring-inset ring-primary/20">
                        RAG
                    </div>
                </div>
            </div>

            {/* 右侧：功能按钮 */}
            {/* 移动端：下拉菜单 */}
            <div className="md:hidden">
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
            </div>

            {/* PC 端：水平按钮组 */}
            <div className="hidden md:flex items-center gap-1">
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
        </header>
    );
}
