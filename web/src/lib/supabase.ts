import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端配置
 * 
 * 用于向量检索和 RPC 调用
 * 注意：使用 Service Role Key 仅限服务端使用
 */

// 环境变量校验
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

/**
 * 服务端 Supabase 客户端
 * 使用 Service Role Key，拥有完整权限
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

/**
 * 向量检索结果类型
 */
export interface VectorSearchResult {
    id: string;
    content: string;
    metadata: {
        source?: string;
        page?: number;
        experiment?: string;
        [key: string]: unknown;
    };
    similarity: number;
}

/**
 * 向量检索函数
 * 调用 Supabase 的 match_documents RPC
 */
export async function vectorSearch(
    queryEmbedding: number[],
    options: {
        matchThreshold?: number;
        matchCount?: number;
        filter?: Record<string, unknown>;
    } = {}
): Promise<VectorSearchResult[]> {
    const { matchThreshold = 0.3, matchCount = 20, filter = {} } = options;

    const { data, error } = await supabaseAdmin.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter: filter,
    });

    if (error) {
        console.error('Vector search error:', error);
        throw error;
    }

    return data || [];
}
