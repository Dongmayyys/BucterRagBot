'use client';

import { Menu, X, MessageSquare, Settings, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';

/**
 * 聊天布局组件
 * 
 * 响应式设计：
 * - PC 端：左侧固定 Sidebar + 右侧主聊天窗口
 * - 手机端：Sidebar 通过 Sheet 弹出
 */

interface ChatLayoutProps {
    children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-background">
            {/* PC 端侧边栏 (md 以上显示) */}
            <aside className="hidden md:flex md:w-64 lg:w-72 flex-col border-r border-border bg-muted/30">
                <SidebarContent />
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* 顶部栏 (手机端显示菜单按钮) */}
                <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-sm md:hidden">
                    {/* 手机端菜单按钮 */}
                    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 p-0">
                            <SidebarContent onClose={() => setSidebarOpen(false)} />
                        </SheetContent>
                    </Sheet>

                    {/* 标题 */}
                    <h1 className="font-semibold text-lg">校园问答</h1>

                    {/* 占位 */}
                    <div className="w-10" />
                </header>

                {/* 聊天内容区 */}
                {children}
            </main>
        </div>
    );
}

/**
 * 侧边栏内容
 */
function SidebarContent({ onClose }: { onClose?: () => void }) {
    return (
        <div className="flex flex-col h-full">
            {/* Logo 区域 */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold">Campus AI</span>
                </div>
                {onClose && (
                    <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
                        <X className="h-5 w-5" />
                    </Button>
                )}
            </div>

            {/* 新对话按钮 */}
            <div className="p-3">
                <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                        // TODO: 实现新对话
                        onClose?.();
                    }}
                >
                    <PlusCircle className="h-4 w-4" />
                    新对话
                </Button>
            </div>

            {/* 历史记录区 (占位) */}
            <ScrollArea className="flex-1 px-3">
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground px-2 py-4">
                        暂无历史记录
                    </p>
                    {/* TODO: 渲染历史对话列表 */}
                </div>
            </ScrollArea>

            {/* 底部设置区 */}
            <div className="p-3 border-t border-border">
                <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                    <Settings className="h-4 w-4" />
                    设置
                </Button>
            </div>
        </div>
    );
}
