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
    totalPages?: number;       // 文档总页数 (用于翻页边界)
    content?: string;          // 文档内容摘要
    similarity?: number;       // 向量相似度分数
    rerank_score?: number;     // Rerank 后的分数
    // 新增字段
    documentId?: string;       // 关联 source_documents.id
    chunkIndex?: number;       // 在文档中的位置（用于上下块导航）
    customImageUrl?: string;   // 自定义图片 URL（优先于 PDF 快照）
    /** @deprecated 2025-12-28: 下载功能已移除，SourcePanel 改为图片预览 */
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
    { emoji: '💰', title: '奖学金申请', query: '怎么申请奖学金？' },
    { emoji: '💡', title: '宿舍条例', query: '寝室断电时间？' },
    { emoji: '🏥', title: '医疗报销', query: '校医院报销哪些项目？' },
    { emoji: '🏃', title: '体育补考', query: '体育补考怎么报名？' },
];

/**
 * 彩蛋版建议问题
 * 多次点击 Emoji 后触发
 */
export const EASTER_EGG_SUGGESTIONS: SuggestionCard[] = [
    { emoji: '🎓', title: '关于Bucter', query: 'Bucter是什么意思？' },
    { emoji: '🧪', title: '四大名捕', query: '北化四大名捕是哪几位？' },
    { emoji: '🌸', title: '最美校园', query: '校园里有什么好看的风景？' },
    { emoji: '🍜', title: '食堂推荐', query: '食堂哪家好吃？' },
];

/**
 * 夜猫子版建议问题（英文）
 * 凌晨 2-8 点显示
 */
export const NIGHT_OWL_SUGGESTIONS: SuggestionCard[] = [
    { emoji: '💰', title: 'Scholarships', query: 'How do I apply for a scholarship?' },
    { emoji: '💡', title: 'Dorm Rules', query: 'When is the electricity cut off in the dorms?' },
    { emoji: '🏥', title: 'Medical Reimbursement', query: 'What medical expenses are reimbursable?' },
    { emoji: '🏃', title: 'PE Make-up Exam', query: 'How do I register for the PE make-up exam?' },
];
