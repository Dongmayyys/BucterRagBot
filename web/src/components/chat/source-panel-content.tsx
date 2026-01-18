'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Citation } from '@/lib/types';
import { getSnapshotUrl } from '@/lib/utils';

/**
 * 溯源面板内容 - 图片预览版
 */
export function SourcePanelContent({ citation, onClose }: { citation: Citation | null; onClose?: () => void }) {
    const [currentPage, setCurrentPage] = useState<number>(citation?.page || 1);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [showLargeImage, setShowLargeImage] = useState(false);



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

    const totalPages = citation.totalPages || 65;
    const documentId = citation.documentId || citation.fileName?.replace('.pdf', '') || '';
    const imageUrl = getSnapshotUrl(documentId, currentPage);

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            setIsImageLoading(true);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            setIsImageLoading(true);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* 面包屑 + 关闭按钮 */}
            <div className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <span>原文预览</span>
                    <span>/</span>
                    <span className="font-medium text-foreground truncate">
                        {citation.fileName?.replace('.pdf', '').slice(5)}
                    </span>
                    <span className="text-xs">
                        ({currentPage} / {totalPages})
                    </span>
                </div>
                {onClose && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* 图片预览区域 */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900 flex items-center justify-center">
                <div className="relative w-full h-full">
                    {/* 缩略图加载状态 */}
                    {isImageLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-gray-900 z-10">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
                            <div className="text-muted-foreground text-xs font-medium">加载中...</div>
                        </div>
                    )}

                    {/* 缩略图 - 点击放大 */}
                    <img
                        src={imageUrl}
                        alt={`第 ${currentPage} 页`}
                        className="w-full h-full object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                        onClick={() => setShowLargeImage(true)}
                        onLoad={() => setIsImageLoading(false)}
                    />
                </div>
            </div>

            {/* 大图弹窗 - 带切换按钮 */}
            <Dialog open={showLargeImage} onOpenChange={setShowLargeImage}>
                <DialogContent className="max-w-full max-h-full w-auto h-auto p-0 rounded-none border-0 bg-transparent shadow-none" showCloseButton={false}>
                    <DialogTitle className="sr-only">原文预览 - 第 {currentPage} 页</DialogTitle>

                    <div className="relative">
                        {/* 加载状态 */}
                        {isImageLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/50 min-w-[200px] min-h-[200px]">
                                <div className="h-8 w-8 animate-spin rounded-full border-3 border-white border-t-transparent mb-2" />
                                <div className="text-white text-sm font-medium">加载中...</div>
                            </div>
                        )}

                        {/* 左侧切换按钮 */}
                        {currentPage > 1 && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handlePrevPage}
                                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </Button>
                        )}

                        {/* 图片 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt={`第 ${currentPage} 页 - 大图`}
                            className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
                            style={{ touchAction: 'pinch-zoom' }}
                            onLoad={() => setIsImageLoading(false)}
                            onError={() => setIsImageLoading(false)}
                        />

                        {/* 右侧切换按钮 */}
                        {currentPage < totalPages && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleNextPage}
                                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                            >
                                <ChevronRight className="h-6 w-6" />
                            </Button>
                        )}

                        {/* 页码指示器 */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-sm font-medium">
                            {currentPage} / {totalPages}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
