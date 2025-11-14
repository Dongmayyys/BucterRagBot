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

// SiliconFlow 配置 (仅用于 Embedding)
const siliconflow = createOpenAI({
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKey: process.env.SILICONFLOW_API_KEY || '',
});

const embeddingModel = siliconflow.textEmbeddingModel('BAAI/bge-m3');

interface UIMessage {
    id: string;
    role: string;
    parts?: { type: string; text?: string }[];
}

type Intent = 'query' | 'chat';

export async function POST(request: Request) {
    console.log('[API] Received chat request');

    try {
        const body = await request.json();
        const { messages }: { messages: UIMessage[] } = body;

        // 从最后一条用户消息中提取查询文本
        const lastMessage = messages[messages.length - 1];
        const query = extractTextFromMessage(lastMessage);
        console.log('[API] Extracted query:', query);

        if (!query) {
            return new Response(
                JSON.stringify({ error: 'No text content in message' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // ★ 1. 意图分类 + Query Rewriting（融合对话历史）
        console.log('[API] Classifying intent and rewriting query...');
        const { intent, rewrittenQuery } = await classifyIntent(query, messages);
        console.log('[API] Intent:', intent);
        console.log('[API] Original query:', query);
        console.log('[API] Rewritten query:', rewrittenQuery);

        let context = '';
        let citations: Citation[] = [];

        // ★ 2. 根据意图决定是否检索
        if (intent === 'query') {
            // 2a. 生成查询向量（使用改写后的 query）
            console.log('[API] Generating embedding...');
            const { embedding: queryEmbedding } = await embed({
                model: embeddingModel,
                value: rewrittenQuery,  // ★ 使用改写后的 query
            });
            console.log('[API] Embedding generated, length:', queryEmbedding.length);

            // 2b. 向量检索 (获取 Top 20)
            console.log('[API] Performing vector search...');
            const searchResults = await vectorSearch(queryEmbedding, {
                matchCount: 20,
                matchThreshold: 0.3,
            });
            console.log('[API] Search results count:', searchResults.length);

            // 2c. Rerank 精排 (获取 Top 6)，使用改写后的 query
            console.log('[API] Reranking...');
            const rankedResults = await rerank(rewrittenQuery, searchResults, 6);  // ★ 使用改写后的 query
            console.log('[API] Reranked results count:', rankedResults.length);

            // 2d. 过滤低分结果 (rerank_score < 0.15 不显示)
            const filteredResults = rankedResults.filter(r => (r.rerank_score ?? 0) >= 0.15);
            console.log('[API] Filtered results count (>=15%):', filteredResults.length);

            // 2e. 构建 Context（带编号，供 LLM 使用）
            context = filteredResults
                .map((r, i) => `[${i + 1}] ${r.content}`)
                .join('\n\n');

            // 2f. 构建 Citations（供前端展示）
            citations = await Promise.all(
                filteredResults.map(async (r) => {
                    const documentId = r.metadata?.document_id as string | undefined;
                    const docMeta = documentId ? await getDocumentMeta(documentId) : null;

                    return {
                        id: r.id,
                        fileName: r.metadata?.source || '未知来源',
                        page: r.metadata?.page,
                        content: r.content,
                        rerank_score: r.rerank_score,
                        documentId: documentId,
                        chunkIndex: r.metadata?.chunk_index as number | undefined,
                        downloadUrl: docMeta?.metadata?.download_url || undefined,
                    };
                })
            );
            console.log('[API] Citations count:', citations.length);
        }

        // 3. 构建 System Prompt（根据意图不同）
        const systemPrompt = intent === 'query'
            ? `你是一个专业的校园问答助手，负责回答学生关于学校规章制度、服务设施等问题。

请严格根据以下参考资料回答问题。如果参考资料中没有相关信息，请诚实告知用户。

## 参考资料
${context || '暂无参考资料'}

## 回答要求
1. 回答要准确、简洁、专业
2. 如果涉及具体流程，请分步骤说明
3. 可以使用 Markdown 格式（列表、表格等）`
            : `你是一个友好的校园助手"巴克特"。用户正在和你闲聊，请用轻松友好的语气回复。
回复要简短、自然，不要过于正式。可以适当使用 emoji 表情。`;

        // 4. 构建聊天消息
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-6).map((msg) => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: extractTextFromMessage(msg),
            })),
        ];

        // 5. 调用 LLM（流式）
        console.log('[API] Calling SiliconFlow Chat Completions API...');
        const llmResponse = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen3-8B',
                messages: chatMessages,
                stream: true,
            }),
        });

        if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error('[API] LLM API error:', errorText);
            return new Response(
                JSON.stringify({ error: 'LLM API error', details: errorText }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
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

        console.log('[API] Returning stream response');
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('[API] Chat API error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

/**
 * 意图分类 + Query Rewriting（融合对话历史）
 * 返回 { intent, rewrittenQuery }
 */
interface IntentResult {
    intent: Intent;
    rewrittenQuery: string;
}

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
  "intent": "query" 或 "chat",
  "rewritten_query": "优化后的检索查询（融合上下文，生成独立的检索语句）"
}

判断规则：
- 如果用户在询问学校相关的问题（规章制度、设施、流程、课程等）→ intent: "query"
- 如果用户只是闲聊、打招呼或问与学校无关的问题 → intent: "chat"

rewritten_query 要求：
- 如果用户输入包含指代词（如"这个"、"第一个"、"怎么申请"），结合对话历史进行指代消解
- 去除口语化表达，提取关键词
- 生成适合向量检索的独立语句

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
                model: 'Qwen/Qwen3-8B',
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
                const intent: Intent = parsed.intent === 'chat' ? 'chat' : 'query';
                const rewrittenQuery = parsed.rewritten_query || query;

                console.log('[Intent] Parsed result:', { intent, rewrittenQuery });
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
                model: 'BAAI/bge-reranker-v2-m3',
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
