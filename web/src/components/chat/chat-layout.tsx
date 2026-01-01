'use client';

import { useState, useEffect } from 'react';
import { Sun, Plus, ChevronLeft, ChevronRight, Upload, Heart, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Citation } from '@/lib/types';
import { getSnapshotUrl } from '@/lib/utils';

/**
 * 聊天布局组件 - 简化版
 * 
 * 结构：
 * - 顶部栏：新对话 + 标题 + 功能按钮（主题/上传/致谢）
 * - 中部：聊天窗口 + 溯源面板（PC 右侧 / 手机弹窗）
 * - 底部：输入框
 */

interface ChatLayoutProps {
    children: React.ReactNode;
    selectedCitation: Citation | null;
    onCloseCitation: () => void;
    onNewChat?: () => void;
    hasMessages?: boolean;
}

export function ChatLayout({ children, selectedCitation, onCloseCitation, onNewChat, hasMessages = false }: ChatLayoutProps) {
    // 检测是否为移动端（< 768px）
    const [isMobile, setIsMobile] = useState(false);
    // 致谢弹窗状态
    const [showCredits, setShowCredits] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 右上角按钮配置
    const actionButtons = [
        { icon: Sun, label: '主题切换', onClick: () => { }, disabled: true },
        { icon: Upload, label: '上传资料', onClick: () => { }, disabled: true },
        { icon: Heart, label: '致谢名单', onClick: () => setShowCredits(true), disabled: false },
    ];

    return (
        <div className="flex h-screen bg-background">
            {/* 右侧：溯源面板 - 全高显示，仅 PC 端 */}
            <aside className="hidden md:flex md:flex-col w-80 border-r border-border bg-muted/30 overflow-hidden order-last">
                <SourcePanelContent citation={selectedCitation} key={selectedCitation?.id} />
            </aside>

            {/* 左侧主区域 */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* 顶部栏 */}
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

                    {/* 右侧：功能按钮 - PC 端直接显示，移动端用菜单 */}
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
                    <SourcePanelContent citation={selectedCitation} key={selectedCitation?.id} />
                </SheetContent>
            </Sheet>

            {/* 致谢弹窗 */}
            <Dialog open={showCredits} onOpenChange={setShowCredits}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Heart className="h-5 w-5 text-pink-500" />
                            致谢名单
                        </DialogTitle>
                        <DialogDescription>
                            感谢以下项目和个人的支持
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <div>
                            <h4 className="font-medium mb-2">🛠 技术栈</h4>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1">
                                <li>Next.js - React 框架</li>
                                <li>Tailwind CSS - 样式框架</li>
                                <li>SiliconFlow - AI 模型服务</li>
                                <li>Supabase - 向量数据库</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">💡 开源项目</h4>
                            <ul className="list-disc list-inside text-muted-foreground space-y-1">
                                <li>Lucide Icons - 图标库</li>
                                <li>shadcn/ui - UI 组件库</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium mb-2">❤️ 特别感谢</h4>
                            <p className="text-muted-foreground">
                                感谢北京化工大学提供的知识资料支持
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/**
 * 溯源面板内容 - 图片预览版
 */
function SourcePanelContent({ citation }: { citation: Citation | null }) {
    // 使用 key机制 强制重置组件状态，无需 useEffect 同步
    const [currentPage, setCurrentPage] = useState<number>(citation?.page || 1);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

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

    const totalPages = citation.totalPages || 65; // 默认 65 页
    const documentId = citation.documentId || citation.fileName?.replace('.pdf', '') || '';
    const imageUrl = getSnapshotUrl(documentId, currentPage);

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            setIsImageLoading(true);
            setImageError(false);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            setIsImageLoading(true);
            setImageError(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* 面板标题 */}
            <div className="shrink-0 px-4 h-14 flex items-center border-b border-border">
                <h3 className="font-medium">原文预览</h3>
            </div>

            {/* 元信息 */}
            <div className="shrink-0 px-4 py-3 border-b border-border bg-muted/50 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">来源：</span>
                    <span className="font-medium truncate">{citation.fileName?.replace('.pdf', '')}</span>
                </div>
                {citation.rerank_score && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">相关度：</span>
                        <span className="text-primary font-medium">
                            {(citation.rerank_score * 100).toFixed(0)}%
                        </span>
                    </div>
                )}
            </div>

            {/* 图片预览区域 */}
            <div className="flex-1 overflow-auto p-2 bg-muted/30 flex items-start justify-center">
                <div className="relative w-full max-w-md">
                    {/* 加载状态 */}
                    {isImageLoading && !imageError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10 rounded-lg">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
                            <div className="text-muted-foreground text-xs font-medium">加载中...</div>
                        </div>
                    )}

                    {/* 错误状态 */}
                    {imageError && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <div className="text-3xl mb-2">🖼️</div>
                            <p className="text-sm">图片加载失败</p>
                            <p className="text-xs mt-1">{imageUrl}</p>
                        </div>
                    )}

                    {/* 图片 */}
                    {!imageError && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={imageUrl}
                            alt={`第 ${currentPage} 页`}
                            className="w-full rounded-lg shadow-md"
                            style={{ aspectRatio: '0.7072' }} // 保持 PDF 宽高比
                            onLoad={() => setIsImageLoading(false)}
                            onError={() => {
                                setIsImageLoading(false);
                                setImageError(true);
                            }}
                        />
                    )}
                </div>
            </div>

            {/* 页码导航 */}
            <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm">
                <div className="p-4 flex items-center justify-between gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage <= 1}
                        className="gap-1 flex-1"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span>上一页</span>
                    </Button>
                    <span className="text-xs text-muted-foreground shrink-0">
                        {currentPage} / {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage >= totalPages}
                        className="gap-1 flex-1"
                    >
                        <span>下一页</span>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
