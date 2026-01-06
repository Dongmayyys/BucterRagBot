import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * API Route: /api/chunks/adjacent
 * 
 * @deprecated 2025-12-28 重构后已废弃
 * 原用途：获取指定 chunk 的相邻 chunks（上一块、下一块），用于溯源面板的"上下文导航"
 * 现状态：
 * - SourcePanel 已改为展示 WebP 图片预览，使用页码导航（上一页/下一页）
 * - 不再需要 chunk 内容导航
 * - 保留此 API 以备将来恢复 chunk 导航功能
 * 
 * 参数:
 *   - document_id: 文档 ID
 *   - chunk_index: 当前 chunk 的索引
 */

interface AdjacentChunk {
    id: string;
    content: string;
    chunkIndex: number;
    title?: string;
}

export async function GET(request: NextRequest) {
    const documentId = request.nextUrl.searchParams.get('document_id');
    const chunkIndexStr = request.nextUrl.searchParams.get('chunk_index');

    if (!documentId || chunkIndexStr === null) {
        return Response.json(
            { error: 'Missing required parameters: document_id and chunk_index' },
            { status: 400 }
        );
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    if (isNaN(chunkIndex)) {
        return Response.json(
            { error: 'Invalid chunk_index: must be a number' },
            { status: 400 }
        );
    }

    console.log(`[adjacent] 查询相邻 chunk: document_id=${documentId}, chunk_index=${chunkIndex}`);

    try {
        // 查询上一块 (chunk_index - 1)
        const { data: prevData } = await supabaseAdmin
            .from('documents')
            .select('id, content, metadata')
            .eq('metadata->>document_id', documentId)
            .eq('metadata->>chunk_index', String(chunkIndex - 1))
            .single();

        // 查询下一块 (chunk_index + 1)
        const { data: nextData } = await supabaseAdmin
            .from('documents')
            .select('id, content, metadata')
            .eq('metadata->>document_id', documentId)
            .eq('metadata->>chunk_index', String(chunkIndex + 1))
            .single();

        const formatChunk = (data: { id: string; content: string; metadata: { chunk_index?: number; title?: string } } | null): AdjacentChunk | null => {
            if (!data) return null;
            return {
                id: data.id,
                content: data.content,
                chunkIndex: data.metadata?.chunk_index ?? 0,
                title: data.metadata?.title,
            };
        };

        const result = {
            prev: formatChunk(prevData),
            next: formatChunk(nextData),
        };

        console.log(`[adjacent] 结果: prev=${!!result.prev}, next=${!!result.next}`);
        return Response.json(result);

    } catch (error) {
        console.error('[adjacent] 查询失败:', error);
        return Response.json({ error: 'Failed to fetch adjacent chunks' }, { status: 500 });
    }
}
