'use client';

import { FileText } from 'lucide-react';
import { Citation } from '@/lib/types';

/**
 * ★ RAG 灵魂组件 - 引用来源卡片
 * 
 * 这是区分普通聊天机器人和 RAG 系统的关键组件
 * 当 AI 回答时，展示答案所依据的文档来源，增强可信度
 */

interface SourceBubbleProps {
    citations: Citation[];
}

export function SourceBubble({ citations }: SourceBubbleProps) {
    if (!citations || citations.length === 0) return null;

    return (
        <div className="flex gap-2 mt-3 flex-wrap">
            {citations.map((citation, idx) => (
                <div
                    key={citation.id || idx}
                    className="group flex items-center gap-1.5 text-xs 
                     bg-muted/50 hover:bg-muted 
                     p-2 px-3 rounded-lg border border-border/50
                     cursor-pointer transition-all duration-200
                     hover:shadow-sm hover:border-border"
                    title={citation.content}
                >
                    {/* 文件图标 */}
                    <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />

                    {/* 文件名 (截断显示) */}
                    <span className="font-medium truncate max-w-[120px] text-foreground/80 group-hover:text-foreground">
                        {citation.fileName}
                    </span>

                    {/* 页码 (如果有) */}
                    {citation.page && (
                        <span className="text-muted-foreground">
                            P{citation.page}
                        </span>
                    )}

                    {/* 相似度分数 (可选展示) */}
                    {citation.rerank_score && (
                        <span className="text-muted-foreground/60 text-[10px]">
                            {(citation.rerank_score * 100).toFixed(0)}%
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
