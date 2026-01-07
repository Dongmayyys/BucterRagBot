'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Citation } from '@/lib/types';
import { getSnapshotUrl } from '@/lib/utils';

/**
 * 溯源面板内容 - 图片预览版
 */
export function SourcePanelContent({ citation }: { citation: Citation | null }) {
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
                            style={{ aspectRatio: '0.7072' }}
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
