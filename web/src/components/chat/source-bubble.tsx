'use client';

import { FileText } from 'lucide-react';
import { Citation } from '@/lib/types';

/**
 * ★ RAG 灵魂组件 - 引用来源卡片
 * 
 * 这是区分普通聊天机器人和 RAG 系统的关键组件
 * 当 AI 回答时，展示答案所依据的文档来源，增强可信度
 * 
 * 点击卡片可以查看原文详情（PC 右侧面板 / 手机底部弹窗）
 */

interface SourceBubbleProps {
    citations: Citation[];
    onCitationClick?: (citation: Citation) => void;
}

export function SourceBubble({ citations, onCitationClick }: SourceBubbleProps) {
    if (!citations || citations.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            {citations.map((citation, idx) => (
                <button
                    key={citation.id || idx}
                    onClick={() => onCitationClick?.(citation)}
                    className="group flex items-center gap-1.5 text-xs 
                     bg-muted/50 hover:bg-muted 
                     p-2 px-3 rounded-lg border border-border/50
                     cursor-pointer transition-all duration-200
                     hover:shadow-sm hover:border-primary/50
                     w-full"
                    title={citation.content
                        ? (citation.content.length > 200
                            ? citation.content.slice(0, 200) + '...'
                            : citation.content)
                        : citation.fileName}
                >
                    {/* 文件图标 */}
                    <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />

                    {/* 文件名 (截断显示，去掉 .pdf 后缀) */}
                    <span className="font-medium truncate flex-1 text-left text-foreground/80 group-hover:text-foreground">
                        {citation.fileName?.replace('.pdf', '') || citation.fileName}
                    </span>

                    {/* 页码 (如果有) */}
                    {citation.page && (
                        <span className="text-muted-foreground shrink-0">
                            P{citation.page}
                        </span>
                    )}

                    {/* 相似度分数 (可选展示) */}
                    {citation.rerank_score && (
                        <span className="text-muted-foreground/60 text-[10px] shrink-0">
                            {(citation.rerank_score * 100).toFixed(0)}%
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
