'use client';

import { Sun, Moon, Heart, Plus, Menu, Upload, Monitor, Palette, Check } from 'lucide-react';
import { useTheme } from "next-themes";
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
    const { theme, setTheme } = useTheme();

    const actionButtons = [
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
                        {/* 移动端：一行三态切换 */}
                        <div className="flex items-center justify-center px-2 py-2 mb-1 w-full">
                            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50 w-full">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`flex-1 h-7 rounded-sm transition-all ${theme === 'light' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                    onClick={() => setTheme("light")}
                                    title="浅色模式"
                                >
                                    <Sun className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`flex-1 h-7 rounded-sm transition-all ${theme === 'dark' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                    onClick={() => setTheme("dark")}
                                    title="深色模式"
                                >
                                    <Moon className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`flex-1 h-7 rounded-sm transition-all ${theme === 'system' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                    onClick={() => setTheme("system")}
                                    title="跟随系统"
                                >
                                    <Monitor className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* 其他功能按钮 */}
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
                {/* 主题切换下拉菜单 - PC端用中性图标 */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="切换主题">
                            <Palette className="h-5 w-5" />
                            <span className="sr-only">切换主题</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setTheme("light")} className="justify-between">
                            <div className="flex items-center">
                                <Sun className="mr-2 h-4 w-4" />
                                <span>浅色模式</span>
                            </div>
                            {theme === 'light' && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("dark")} className="justify-between">
                            <div className="flex items-center">
                                <Moon className="mr-2 h-4 w-4" />
                                <span>深色模式</span>
                            </div>
                            {theme === 'dark' && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme("system")} className="justify-between">
                            <div className="flex items-center">
                                <Monitor className="mr-2 h-4 w-4" />
                                <span>跟随系统</span>
                            </div>
                            {theme === 'system' && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

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
