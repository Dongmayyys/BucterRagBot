import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { vectorSearch, VectorSearchResult } from '@/lib/supabase';
import { Citation } from '@/lib/types';

/**
 * API Route: /api/chat
 * 
 * RAG 对话的核心入口：
 * 1. 接收消息
 * 2. 生成查询向量 (Embedding)
 * 3. 向量检索 (Supabase)
 * 4. Rerank 精排 (SiliconFlow)
 * 5. LLM 生成回答 (直接调用 SiliconFlow Chat Completions API)
 * 6. 返回流式文本响应
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

        // 1. 生成查询向量
        console.log('[API] Generating embedding...');
        const { embedding: queryEmbedding } = await embed({
            model: embeddingModel,
            value: query,
        });
        console.log('[API] Embedding generated, length:', queryEmbedding.length);

        // 2. 向量检索 (获取 Top 20)
        console.log('[API] Performing vector search...');
        const searchResults = await vectorSearch(queryEmbedding, {
            matchCount: 20,
            matchThreshold: 0.3,
            // 数据库应只保留最优切分策略，无需 filter
        });
        console.log('[API] Search results count:', searchResults.length);

        // 3. Rerank 精排 (获取 Top 5)
        console.log('[API] Reranking...');
        const rankedResults = await rerank(query, searchResults, 5);
        console.log('[API] Reranked results count:', rankedResults.length);

        // 4. 构建 Context（带编号，供 LLM 使用）
        const context = rankedResults
            .map((r, i) => `[${i + 1}] ${r.content}`)
            .join('\n\n');

        // 5. 构建 Citations（供前端展示）
        const citations: Citation[] = rankedResults.map((r) => ({
            id: r.id,
            fileName: r.metadata?.source || '未知来源',
            page: r.metadata?.page,
            // content: r.content.slice(0, 150) + '...',
            content: r.content,  // 不截断
            rerank_score: r.rerank_score,
        }));
        console.log('[API] Citations count:', citations.length);

        // 5. 构建 System Prompt
        const systemPrompt = `你是一个专业的校园问答助手，负责回答学生关于学校规章制度、服务设施等问题。

请严格根据以下参考资料回答问题。如果参考资料中没有相关信息，请诚实告知用户。

## 参考资料
${context || '暂无参考资料'}

## 回答要求
1. 回答要准确、简洁、专业
2. 如果涉及具体流程，请分步骤说明
3. 可以使用 Markdown 格式（列表、表格等）`;

        // 6. 构建聊天消息
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-6).map((msg) => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: extractTextFromMessage(msg),
            })),
        ];

        // 7. 直接调用 SiliconFlow Chat Completions API (流式)
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

        // 8. 转换 SSE 流为纯文本流
        const reader = llmResponse.body?.getReader();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                if (!reader) {
                    controller.close();
                    return;
                }

                // ★ 先发送 citations JSON + 分隔符
                const citationsLine = JSON.stringify({ citations }) + '\n---STREAM_START---\n';
                controller.enqueue(encoder.encode(citationsLine));

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
