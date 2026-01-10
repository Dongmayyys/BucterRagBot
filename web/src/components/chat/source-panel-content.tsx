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
    const [imageError, setImageError] = useState(false);
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
            {/* 面包屑 + 关闭按钮 */}
            <div className="shrink-0 px-4 h-14 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <span>原文预览</span>
                    <span>/</span>
                    <span className="font-medium text-foreground truncate">
                        {citation.fileName?.replace('.pdf', '')}
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

            {/* 图片预览区域 + 两侧按钮 */}
            <div className="flex-1 overflow-hidden p-2 bg-muted/30 flex items-center justify-center relative">
                {/* 左侧按钮 */}
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    className="absolute left-2 z-20 h-12 w-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>

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

                    {/* 缩略图 - 点击放大 */}
                    {!imageError && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={imageUrl}
                            alt={`第 ${currentPage} 页`}
                            className="w-full rounded-lg shadow-md cursor-zoom-in transition-opacity hover:opacity-90"
                            style={{ aspectRatio: '0.7072' }}
                            onClick={() => setShowLargeImage(true)}
                            onLoad={() => setIsImageLoading(false)}
                            onError={() => {
                                setIsImageLoading(false);
                                setImageError(true);
                            }}
                        />
                    )}
                </div>

                {/* 右侧按钮 */}
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                    className="absolute right-2 z-20 h-12 w-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                    <ChevronRight className="h-6 w-6" />
                </Button>
            </div>

            {/* 大图弹窗 - 纯方形 */}
            <Dialog open={showLargeImage} onOpenChange={setShowLargeImage}>
                <DialogContent className="max-w-full max-h-full w-auto h-auto p-0 rounded-none border-0 bg-transparent shadow-none">
                    <DialogTitle className="sr-only">原文预览 - 第 {currentPage} 页</DialogTitle>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={`第 ${currentPage} 页 - 大图`}
                        className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
                        style={{ touchAction: 'pinch-zoom' }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
