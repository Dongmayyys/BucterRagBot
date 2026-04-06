import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, Citation } from '@/lib/types';
import { ProcessingPhase } from '@/components/chat/processing-steps';
import { useStreamBuffer } from './use-stream-buffer';

/**
 * useChat — 对话流程逻辑层
 *
 * 职责：
 *   - 状态管理（messages, isLoading, error, phase 等）
 *   - 流式请求控制（fetch + AbortController）
 *   - 自定义协议解析（JSON 头 + 分隔符 + 纯文本流）
 *   - 缓冲调度（内部调用 useStreamBuffer）
 *   - 中断处理（区分 AbortError 与其他异常）
 *   - 终态收敛（无论成功/中断/异常都进入确定状态）
 *
 * 不负责：
 *   - UI 展示状态（彩蛋、弹窗等由 page.tsx 编排）
 *   - 视口适配（由 useVisualViewport 独立处理）
 */

// 自定义混合协议的分隔符：JSON 元数据 + 该标记 + 纯文本流
const STREAM_SEPARATOR = '---STREAM_START---';

export function useChat() {
  // ————————————————————————————————————————————
  // 状态
  // ————————————————————————————————————————————

  // ⚠️ 临时：生成 500 条假消息用于虚拟列表性能测试（验证完删掉）
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const mock: ChatMessage[] = [];
    for (let i = 0; i < 500; i++) {
      mock.push({
        id: `user-${i}`,
        role: 'user',
        content: `这是第 ${i + 1} 条用户消息，包含一些额外文字来增加 DOM 复杂度。用户可能会输入很长的问题，比如关于技术架构、性能优化、代码实现等方面的详细描述。`,
      });
      mock.push({
        id: `assistant-${i}`,
        role: 'assistant',
        content: `## 回复 #${i + 1}\n\n这是一段较长的 AI 回复，包含多种 Markdown 元素：\n\n### 代码示例\n\n\`\`\`javascript\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\nconsole.log(fibonacci(10));\n\`\`\`\n\n### 表格\n\n| 方案 | 优点 | 缺点 |\n|------|------|------|\n| 方案 A | 简单 | 性能差 |\n| 方案 B | 高效 | 复杂 |\n| 方案 C | 均衡 | 需权衡 |\n\n### 列表\n\n- 第一点：这是一个比较长的列表项\n- 第二点：包含 \`内联代码\` 和 **加粗文本**\n- 第三点：还有 [链接](https://example.com)\n\n> 引用：性能优化需要数据驱动，不是想象驱动。`,
      });
    }
    return mock;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [hasResults, setHasResults] = useState(true);
  const [isChat, setIsChat] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // ————————————————————————————————————————————
  // 内部 refs
  // ————————————————————————————————————————————

  const abortControllerRef = useRef<AbortController | null>(null);

  // 流式缓冲区（内部消费，不对外暴露）
  const {
    start: startBuffer,
    push: pushToBuffer,
    flushAll,
    reset: resetBuffer,
  } = useStreamBuffer();

  // ————————————————————————————————————————————
  // send — 核心发送逻辑
  // ————————————————————————————————————————————

  const send = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);
    setPhase('thinking'); // ★ 阶段 1：思考（意图分类）
    setIsChat(false);
    setHasResults(true);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    // 1. 添加用户消息
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 2. 添加空的 assistant 消息（用于流式填充）
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      // 3. 构建请求体
      const uiMessages = [...messages, userMessage].map(msg => ({
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content }],
      }));

      // 4. 发送请求
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: uiMessages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // 5. 读取流式响应
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let citations: Citation[] = [];
      let streamStarted = false;
      let intent: 'query' | 'chat' | 'error' = 'query';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 6. 检测分隔符，解析 JSON 头（intent + citations）
        if (!streamStarted && buffer.includes(STREAM_SEPARATOR)) {
          const [jsonPart, rest] = buffer.split(STREAM_SEPARATOR);

          try {
            const parsed = JSON.parse(jsonPart.trim());
            intent = parsed.intent || 'query';
            citations = parsed.citations || [];
            console.log('[useChat] Intent:', intent, 'Citations:', citations.length);

            setIsChat(intent === 'chat');
            setHasResults(citations.length > 0);

            // ★ 根据意图设置处理阶段
            if (intent === 'error') {
              setPhase('error');
            } else if (intent === 'chat') {
              // 闲聊：跳过检索和整理，直接进入生成
              setPhase('generating');
            } else if (citations.length === 0) {
              // 无检索结果：跳过动画，直接 done
              setPhase('done');
            } else {
              // 知识查询：显示查询阶段完成，进入整理
              setPhase('searching');
              // 使用函数式更新防止覆盖已完成/已错误的最终状态
              setTimeout(() => setPhase(p => (p === 'done' || p === 'error' || p === 'idle') ? p : 'organizing'), 100);
              setTimeout(() => setPhase(p => (p === 'done' || p === 'error' || p === 'idle') ? p : 'generating'), 200);
            }
          } catch (e) {
            console.error('[useChat] Failed to parse header:', e);
            setHasResults(false);
          }

          buffer = rest?.trim() || '';
          streamStarted = true;

          // 注册缓冲区 flush 回调（此时 intent 和 citations 已确定，闭包捕获安全）
          const msgCitations = intent === 'query' ? citations : undefined;
          startBuffer((content) => {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantId
                  ? { ...msg, content, citations: msgCitations }
                  : msg
              )
            );
          });
        }

        // 7. 将内容写入缓冲区（由双触发条件驱动渲染，不再逐 chunk setState）
        if (streamStarted) {
          pushToBuffer(buffer);
        }
      }

      // 流正常结束：立即 flush 剩余缓冲区内容，确保最后几个字符不丢
      flushAll();

      // ★ 错误状态时保持 error phase，不覆盖
      if (intent !== 'error') {
        setPhase('done');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 用户主动中断：保留已生成的内容，丢弃未 flush 的缓冲
        console.log('[useChat] Request aborted by user');
        resetBuffer();
        setPhase('done');
        return;
      }

      // 其他异常：设置错误状态，保留已有内容的消息，只删空气泡
      console.error('[useChat] Error:', err);
      resetBuffer();
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('idle');
      setMessages(prev => prev.filter(msg =>
        msg.id !== assistantId || msg.content.length > 0
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, messages, startBuffer, pushToBuffer, flushAll, resetBuffer]);

  // ————————————————————————————————————————————
  // stop — 中断当前生成
  // ————————————————————————————————————————————

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ————————————————————————————————————————————
  // clear — 清除对话历史，重置所有状态
  // ————————————————————————————————————————————

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setSelectedCitation(null);
    setError(null);
    setIsLoading(false);
    setPhase('idle');
    setIsChat(false);
  }, []);

  // ————————————————————————————————————————————
  // 组件卸载时 abort 进行中的请求
  // ————————————————————————————————————————————

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    messages,
    isLoading,
    error,
    phase,
    isChat,
    hasResults,
    selectedCitation,
    setSelectedCitation,
    send,
    stop,
    clear,
  };
}
