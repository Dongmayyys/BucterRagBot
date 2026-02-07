import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { vectorSearch, VectorSearchResult, getDocumentMeta } from '@/lib/supabase';
import { Citation } from '@/lib/types';

/**
 * API Route: /api/chat
 * 
 * RAG 对话的核心入口（支持意图分类）：
 * 1. 接收消息
 * 2. 意图分类（query / chat）
 * 3. 如果是 query：向量检索 → Rerank → LLM 生成
 * 4. 如果是 chat：直接 LLM 回复
 * 5. 返回流式文本响应
 */

// SiliconFlow 配置
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const siliconflow = createOpenAI({
    baseURL: SILICONFLOW_BASE_URL,
    apiKey: process.env.SILICONFLOW_API_KEY || '',
});

// 模型配置
const LLM_MODEL = process.env.LLM_MODEL || 'Qwen/Qwen3-8B';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
const RERANK_MODEL = process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3';

// RAG 参数
const SEARCH_MATCH_COUNT = parseInt(process.env.SEARCH_MATCH_COUNT || '20');
const RERANK_TOP_N = parseInt(process.env.RERANK_TOP_N || '6');
const RERANK_THRESHOLD = parseFloat(process.env.RERANK_THRESHOLD || '0.15');

// LLM 参数
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '20000');
const TEMPERATURE_QUERY = parseFloat(process.env.TEMPERATURE_QUERY || '0.3');
const TEMPERATURE_CHAT = parseFloat(process.env.TEMPERATURE_CHAT || '0.7');

const embeddingModel = siliconflow.textEmbeddingModel(EMBEDDING_MODEL);

interface UIMessage {
    id: string;
    role: string;
    parts?: { type: string; text?: string }[];
}

// 意图类型
type Intent = 'query' | 'chat' | 'angry';
type IntentResult = { intent: Intent; rewrittenQuery: string };


export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { messages }: { messages: UIMessage[] } = body;

        // 从最后一条用户消息中提取查询文本
        const lastMessage = messages[messages.length - 1];
        const query = extractTextFromMessage(lastMessage);
        console.log(`📥 Query: "${query}"`);

        if (!query) {
            return createErrorStream('抱歉，消息内容为空 😅\n\n请输入您的问题。');
        }

        // ★ 1. 意图分类 + Query Rewriting（融合对话历史）
        const intentStartTime = Date.now();

        // 🥚 彩蛋检测：包含"巴克特"或"Bucter"时强制查询知识库
        const isEasterEgg = query.includes('巴克特') || query.toLowerCase().includes('bucter');

        // 彩蛋特殊处理：强制 query intent + 重写为中文
        const { intent, rewrittenQuery } = isEasterEgg
            ? {
                intent: 'query' as const,
                rewrittenQuery: '巴克特'
            }
            : await classifyIntent(query, messages);

        console.log(`🎯 Intent: ${intent}${isEasterEgg ? ' (Easter Egg)' : ''}, Rewritten: "${rewrittenQuery}" [${Date.now() - intentStartTime}ms]`);

        let context = '';
        let citations: Citation[] = [];

        // ★ 2. 根据意图决定是否检索
        if (intent === 'query') {
            const retrieveStartTime = Date.now();

            // 2a. 生成查询向量（使用改写后的 query）
            const { embedding: queryEmbedding } = await embed({
                model: embeddingModel,
                value: rewrittenQuery,
            });

            // 2b. 向量检索
            const searchResults = await vectorSearch(queryEmbedding, {
                matchCount: SEARCH_MATCH_COUNT,
                matchThreshold: 0.3,
            });

            // 2c. Rerank 精排
            const rankedResults = await rerank(rewrittenQuery, searchResults, RERANK_TOP_N);

            // 2d. 过滤低分结果
            const filteredResults = rankedResults.filter(r => (r.rerank_score ?? 0) >= RERANK_THRESHOLD);

            console.log(`🔍 Retrieve: ${searchResults.length} → ${rankedResults.length} → ${filteredResults.length} citations [${Date.now() - retrieveStartTime}ms]`);

            // 2e. 构建 Context（带编号，供 LLM 使用）
            context = filteredResults
                .map((r, i) => `[${i + 1}] ${r.content}`)
                .join('\n\n');

            // 2f. 构建 Citations（供前端展示）
            citations = await Promise.all(
                filteredResults.map(async (r) => {
                    const documentId = r.metadata?.document_id as string | undefined;
                    // @deprecated 2025-12-28: getDocumentMeta 已废弃
                    // 原因：source_documents 表已取消，下载功能已移除
                    // 暂时跳过查询，避免无意义的网络请求
                    // 恢复方法：取消下方注释，并确保 source_documents 表存在
                    // const docMeta = documentId ? await getDocumentMeta(documentId) : null;

                    return {
                        id: r.id,
                        fileName: r.metadata?.source || '未知来源',
                        page: r.metadata?.page_number as number | undefined,
                        totalPages: r.metadata?.total_pages as number | undefined,
                        content: r.content,
                        rerank_score: r.rerank_score,
                        documentId: documentId,
                        chunkIndex: r.metadata?.chunk_index as number | undefined,
                        customImageUrl: r.metadata?.custom_image_url as string | undefined,
                        // @deprecated: 下载功能已移除，直接设为 undefined
                        downloadUrl: undefined,
                    };
                })
            );
            // citations.length 已在上方 Retrieve 日志中输出
        }

        // ★ 3. 无检索结果时直接返回道歉信息（防止幻觉）
        if (intent === 'query' && citations.length === 0) {
            console.log('⚠️ No citations found, returning fallback');
            const fallbackMessage = `抱歉，没有找到相关的资料🤐

您可以尝试：
- 换一种方式描述问题
- 提供更多关键词
- 询问其他学校相关的问题

如果确实需要帮助，建议联系学校相关部门咨询。`;

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    const headerLine = JSON.stringify({ intent, citations: [] }) + '\n---STREAM_START---\n';
                    controller.enqueue(encoder.encode(headerLine));
                    controller.enqueue(encoder.encode(fallbackMessage));
                    controller.close();
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                },
            });
        }

        // ★ 3.5. 用户生气时返回固定安慰文本
        if (intent === 'angry') {
            console.log('😡 User is angry, returning comfort message');
            const comfortMessage = `你说得对，但巴克特是《铠甲勇士刑天》中的一名反派角色，实力较强。`;

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    const headerLine = JSON.stringify({ intent, citations: [] }) + '\n---STREAM_START---\n';
                    controller.enqueue(encoder.encode(headerLine));
                    controller.enqueue(encoder.encode(comfortMessage));
                    controller.close();
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                },
            });
        }

        // 4. 构建 System Prompt（根据意图不同）
        let systemPrompt: string;

        if (isEasterEgg) {
            // 🥚 彩蛋专用 System Prompt：严格按资料回复
            systemPrompt = `请**严格按照以下参考资料的原文内容**回答，不要添加、修改或解释。回答必须以'Bucter也即巴克特'作为开头，其中关于技能的描述必须用markdown表格展示。

## 参考资料
${context}`;
        } else if (intent === 'query') {
            // 正常 RAG 查询
            systemPrompt = `你是一个名为巴克特(即Bucter)的北京化工大学校园问答助手。

## 参考资料
${context}

## 回答要求
1. **严格依据**：只能使用参考资料中的内容，禁止胡编乱造
2. **引用标注**：使用 [1]、[2] 等脚注标注引用来源
3. **格式清晰**：流程用步骤、对比用表格、列举用列表
4. **诚实告知**：如果参考资料无法回答，请坦诚说"资料中未找到相关信息"
5. **时效提醒**：涉及政策时，提醒用户以最新官方文件为准
6. **语气友好**：用亲切自然的语气，像朋友一样帮助学生

## 边界
- 只回答与北京化工大学相关的问题
- 不涉及政治敏感话题`;
        } else {
            // 闲聊模式
            systemPrompt = `你是一个名为巴克特(即Bucter)的友好校园助手。用户正在和你闲聊，请用轻松友好的语气回复。
回复要简短、自然，不要过于正式。可以适当使用 emoji 表情。`;
        }


        // 4. 构建聊天消息
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-6).map((msg) => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: extractTextFromMessage(msg),
            })),
        ];

        // 5. 调用 LLM（流式，带超时检测）
        console.log('🤖 Generating response...');

        // 创建超时控制器
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), LLM_TIMEOUT_MS);

        let llmResponse: Response;
        try {
            llmResponse = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: LLM_MODEL,
                    messages: chatMessages,
                    stream: true,
                    temperature: intent === 'chat' ? TEMPERATURE_CHAT : TEMPERATURE_QUERY,
                }),
                signal: timeoutController.signal,
            });
        } catch (fetchError) {
            clearTimeout(timeoutId);
            console.error('[API] LLM fetch error:', fetchError);

            // 返回友好的错误消息流
            const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
            const errorMessage = isTimeout
                ? `抱歉，响应超时了 ⏳

AI 服务器正在繁忙，请稍后重试。`
                : `抱歉，连接 AI 服务失败 😵

可能的原因：
- 网络连接不稳定
- AI 服务器暂时不可用

请稍后重试。`;

            return createErrorStream(errorMessage);
        }
        clearTimeout(timeoutId);

        if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error('[API] LLM API error:', errorText);

            // 解析错误类型
            let userMessage = `抱歉，AI 服务出现问题 😵

请稍后重试，或联系管理员。`;

            if (errorText.includes('rate_limit') || llmResponse.status === 429) {
                userMessage = `抱歉，请求太频繁了 ⏳

AI 服务有速率限制，请稍等片刻再试。`;
            } else if (errorText.includes('context_length') || llmResponse.status === 400) {
                userMessage = `抱歉，对话内容太长了 📝

建议开始新对话后重试。`;
            }

            return createErrorStream(userMessage);
        }

        // 6. 转换 SSE 流为纯文本流
        const reader = llmResponse.body?.getReader();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                if (!reader) {
                    controller.close();
                    return;
                }

                // ★ 先发送 intent + citations JSON + 分隔符
                const headerLine = JSON.stringify({ intent, citations }) + '\n---STREAM_START---\n';
                controller.enqueue(encoder.encode(headerLine));

                const decoder = new TextDecoder();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') continue;

                                try {
                                    const json = JSON.parse(data);
                                    const content = json.choices?.[0]?.delta?.content;
                                    if (content) {
                                        controller.enqueue(encoder.encode(content));
                                    }
                                } catch {
                                    // 忽略解析错误
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('[API] Stream error:', error);
                } finally {
                    controller.close();
                }
            },
        });

        console.log(`✅ Response sent [Total: ${Date.now() - startTime}ms]\n${'─'.repeat(50)}`);
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('[API] Chat API error:', error);
        return createErrorStream('抱歉，服务器开小差了 😵\n\n请稍后重试，或联系管理员。');
    }
}

/**
 * 意图分类 + Query Rewriting（融合对话历史）
 * 返回 { intent, rewrittenQuery }
 */
async function classifyIntent(query: string, messages: UIMessage[]): Promise<IntentResult> {
    // 构建对话历史（最近 4 轮，不含最后一条）
    const historyMessages = messages.slice(-5, -1);
    const historyText = historyMessages.length > 0
        ? historyMessages.map(m => {
            const role = m.role === 'assistant' ? 'AI' : '用户';
            const text = extractTextFromMessage(m);
            return `${role}：${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`;
        }).join('\n')
        : '（无历史）';

    const classifyPrompt = `结合对话历史，分析用户最新输入，返回 JSON（不要有其他内容）：
{
  "intent": "query" 或 "chat" 或 "angry",
  "rewritten_query": "优化后的检索查询（融合上下文，生成独立的检索语句）"
}

判断规则：
- 如果用户表达不满、生气、愤怒（如：垃圾、什么破、太烂、无语、崩溃等）→ intent: "angry"
- 如果用户在询问学校相关的问题（规章制度、设施、流程、课程等）→ intent: "query"
- 如果用户只是闲聊、打招呼或问与学校无关的问题 → intent: "chat"

rewritten_query 要求：
- 如果用户输入包含指代词（如"这个"、"第一个"、"怎么申请"），结合对话历史进行指代消解
- 去除口语化表达，提取关键词
- 生成适合向量检索的独立语句
- **重要：如果用户使用英文或其他语言提问，必须将 rewritten_query 翻译成标准的中文（以便在中文知识库中检索）**

对话历史：
${historyText}

用户最新输入：${query}`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [{ role: 'user', content: classifyPrompt }],
                max_tokens: 200,
                temperature: 0,
            }),
        });

        if (!response.ok) {
            console.error('[Intent] API failed:', await response.text());
            return { intent: 'query', rewrittenQuery: query };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';

        // 尝试解析 JSON
        try {
            // 提取 JSON 部分（处理可能的 markdown 代码块）
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const intent: Intent =
                    parsed.intent === 'angry' ? 'angry' :
                        parsed.intent === 'chat' ? 'chat' : 'query';
                const rewrittenQuery = parsed.rewritten_query || query;

                return { intent, rewrittenQuery };
            }
        } catch (parseError) {
            console.error('[Intent] JSON parse error:', parseError, 'Content:', content);
        }

        // 回退：尝试简单判断
        if (content.toLowerCase().includes('chat')) {
            return { intent: 'chat', rewrittenQuery: query };
        }
        return { intent: 'query', rewrittenQuery: query };
    } catch (error) {
        console.error('[Intent] Error:', error);
        return { intent: 'query', rewrittenQuery: query };
    }
}

/**
 * 从 UIMessage 中提取文本内容
 */
function extractTextFromMessage(message: UIMessage): string {
    if (!message.parts) return '';

    return message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && !!part.text)
        .map((part) => part.text)
        .join('');
}

/**
 * Rerank 精排
 */
async function rerank(
    query: string,
    documents: VectorSearchResult[],
    topK: number = 5
): Promise<(VectorSearchResult & { rerank_score?: number })[]> {
    if (!documents.length) return [];

    const docTexts = documents.map((d) => d.content);

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/rerank', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: RERANK_MODEL,
                query,
                documents: docTexts,
                top_n: topK,
                return_documents: false,
            }),
        });

        if (!response.ok) {
            console.error('[Rerank] API failed:', await response.text());
            return documents.slice(0, topK);
        }

        const data = await response.json();
        const results: { index: number; relevance_score: number }[] = data.results || [];

        return results.map((item) => ({
            ...documents[item.index],
            rerank_score: item.relevance_score,
        }));
    } catch (error) {
        console.error('[Rerank] Error:', error);
        return documents.slice(0, topK);
    }
}

/**
 * 创建错误消息流响应（用于向前端返回友好错误提示）
 */
function createErrorStream(message: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // ★ intent 直接设为 'error'，前端统一处理
            const headerLine = JSON.stringify({ intent: 'error', citations: [] }) + '\n---STREAM_START---\n';
            controller.enqueue(encoder.encode(headerLine));
            controller.enqueue(encoder.encode(message));
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    });
}
