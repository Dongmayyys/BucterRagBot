import { useRef, useCallback, useEffect } from 'react';

/**
 * 流式缓冲 Hook —— 在网络接收层和渲染层之间加入缓冲区
 *
 * 解决的问题：
 *   LLM 流式输出时，每个 chunk 都触发 setState → React 重渲染，
 *   导致更新频率过高（每秒可达 30-60 次），远超屏幕刷新率（60fps）。
 *
 * 方案：
 *   chunk 到达时只写入 buffer（不触发渲染），
 *   由 setTimeout 以固定间隔（默认 50ms）批量 flush 到 React state。
 *   间隔内多个 chunk 只产生 1 次渲染。
 *
 * 使用方式：
 *   1. start(onFlush) — 流开始时注册 flush 回调
 *   2. push(content)  — while 循环中替代直接 setState
 *   3. flushAll()     — 流结束时确保剩余内容输出
 *   4. reset()        — 中断/出错时清理
 */
export function useStreamBuffer(interval = 50) {
  // 缓冲区：存储最新的完整文本（每次 push 传入的是累积全文，非增量）
  const contentRef = useRef('');
  // 定时器 ID：非零表示有待执行的 flush
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // flush 回调引用
  const flushFnRef = useRef<((content: string) => void) | null>(null);

  // ⚠️ 临时调试计数器（验证完删掉）
  const pushCountRef = useRef(0);
  const flushCountRef = useRef(0);

  /**
   * 启动缓冲区，注册 flush 回调
   * 在流的 JSON header 解析完成后调用（此时 intent/citations 已确定）
   */
  const start = useCallback((onFlush: (content: string) => void) => {
    contentRef.current = '';
    flushFnRef.current = onFlush;
  }, []);

  /**
   * 将内容写入缓冲区，安排定时 flush
   *
   * 关键机制：如果已经安排了 flush（timerRef 非空），
   * 只更新 contentRef，不重复安排。等定时器触发时自然拿到最新值。
   * → interval ms 内 N 次 push = 1 次渲染
   */
  const push = useCallback((content: string) => {
    contentRef.current = content;
    pushCountRef.current++;
    if (!timerRef.current && flushFnRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushCountRef.current++;
        flushFnRef.current?.(contentRef.current);
      }, interval);
    }
  }, [interval]);

  /**
   * 立即 flush 剩余内容
   * 流正常结束时调用，确保最后几个字符不会因为"等定时器"而丢失
   */
  const flushAll = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    flushCountRef.current++;
    flushFnRef.current?.(contentRef.current);
    // ⚠️ 临时：输出统计结果
    console.log(`[StreamBuffer] push: ${pushCountRef.current} 次, flush: ${flushCountRef.current} 次, 节省渲染: ${pushCountRef.current - flushCountRef.current} 次`);
    pushCountRef.current = 0;
    flushCountRef.current = 0;
  }, []);

  /**
   * 重置缓冲区
   * 用户中断（AbortError）或请求异常时调用，丢弃未 flush 的内容
   */
  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    contentRef.current = '';
    flushFnRef.current = null;
  }, []);

  // 组件卸载时清理定时器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { start, push, flushAll, reset };
}
