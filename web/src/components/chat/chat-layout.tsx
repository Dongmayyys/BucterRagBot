'use client';

import { useState, useEffect } from 'react';
import { Github, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Citation } from '@/lib/types';

/**
 * 聊天布局组件 - 简化版
 * 
 * 结构：
 * - 顶部栏：GitHub + 标题 + 主题切换
 * - 中部：聊天窗口 + 溯源面板（PC 右侧 / 手机弹窗）
 * - 底部：输入框
 */

interface ChatLayoutProps {
    children: React.ReactNode;
    selectedCitation: Citation | null;
    onCloseCitation: () => void;
}

export function ChatLayout({ children, selectedCitation, onCloseCitation }: ChatLayoutProps) {
    // 检测是否为移动端（< 768px）
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
        <div className="flex h-screen bg-background">
            {/* 右侧：溯源面板 - 全高显示，仅 PC 端 */}
            <aside className="hidden md:flex md:flex-col w-80 border-r border-border bg-muted/30 overflow-hidden order-last">
                <SourcePanelContent citation={selectedCitation} />
            </aside>

            {/* 左侧主区域 */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* 顶部栏 */}
                <header className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-sm">
                    {/* 左侧：GitHub 链接 */}
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        title="查看源码"
                    >
                        <Github className="h-5 w-5" />
                    </a>

                    {/* 中间：标题 */}
                    <h1 className="font-semibold text-lg">校园智能问答</h1>

                    {/* 右侧：主题切换（预留） */}
                    <Button variant="ghost" size="icon" disabled title="主题切换（开发中）">
                        <Sun className="h-5 w-5" />
                    </Button>
                </header>

                {/* 聊天区域 */}
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {children}
                </main>
            </div>

            {/* 手机端：溯源弹窗（仅移动端打开） */}
            <Sheet open={isMobile && !!selectedCitation} onOpenChange={(open) => !open && onCloseCitation()}>
                <SheetContent side="bottom" className="h-[70vh]">
                    <SheetTitle className="sr-only">原文详情</SheetTitle>
                    <SheetDescription className="sr-only">查看引用来源的原文内容</SheetDescription>
                    <SourcePanelContent citation={selectedCitation} />
                </SheetContent>
            </Sheet>
        </div>
    );
}

/**
 * 溯源面板内容
 */
function SourcePanelContent({ citation }: { citation: Citation | null }) {
    if (!citation) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <div className="text-4xl mb-4">📄</div>
                <p className="text-center text-sm">
                    点击消息中的引用来源，<br />查看原文详情
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* 面板标题 - 与顶部栏同高 */}
            <div className="shrink-0 px-4 h-14 flex items-center border-b border-border">
                <h3 className="font-medium">原文详情</h3>
            </div>

            {/* 元信息 */}
            <div className="shrink-0 px-4 py-3 border-b border-border bg-muted/50 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">来源：</span>
                    <span className="font-medium">{citation.fileName}</span>
                </div>
                {citation.page && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">页码：</span>
                        <span>第 {citation.page} 页</span>
                    </div>
                )}
                {citation.rerank_score && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">相关度：</span>
                        <span className="text-primary font-medium">
                            {(citation.rerank_score * 100).toFixed(0)}%
                        </span>
                    </div>
                )}
            </div>

            {/* 原文内容 */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {citation.content || '暂无原文内容'}
                </p>
            </div>
        </div>
    );
}
