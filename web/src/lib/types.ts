/**
 * 消息和引用来源的类型定义
 * 这些类型确保前后端数据结构的一致性
 */

/**
 * 单条引用来源
 * 当 AI 回答时，展示答案所依据的文档片段
 */
export interface Citation {
    id: string;                // 文档块的唯一标识
    fileName: string;          // 来源文件名 (如 "2025-本科生学习指南.pdf")
    page?: number;             // 页码 (如果有)
    content?: string;          // 文档内容摘要
    similarity?: number;       // 向量相似度分数
    rerank_score?: number;     // Rerank 后的分数
    // 新增字段
    documentId?: string;       // 关联 source_documents.id
    chunkIndex?: number;       // 在文档中的位置（用于上下块导航）
    downloadUrl?: string;      // 下载链接
}

/**
 * 聊天消息
 * 兼容 Vercel AI SDK 的 Message 类型，并扩展引用来源
 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: Date;
    citations?: Citation[];    // AI 消息专属：引用来源
}

/**
 * 空状态建议卡片
 */
export interface SuggestionCard {
    emoji: string;
    title: string;
    query: string;
}

/**
 * 预定义的建议问题
 * 在对话列表为空时展示，引导用户提问
 */
export const DEFAULT_SUGGESTIONS: SuggestionCard[] = [
    { emoji: '🤔', title: '奖学金申请', query: '怎么申请奖学金？' },
    { emoji: '📚', title: '图书馆开放', query: '图书馆几点闭馆？' },
    { emoji: '🏥', title: '校医院位置', query: '校医院在哪里？' },
    { emoji: '🏃', title: '体育补考', query: '体育补考怎么报名？' },
];
