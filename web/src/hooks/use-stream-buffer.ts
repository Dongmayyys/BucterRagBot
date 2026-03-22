import { useRef, useCallback, useEffect } from 'react';

/**
 * 流式缓冲 Hook —— 在网络接收层和渲染层之间加入缓冲区
 *
 * 解决的问题：
 *   LLM 流式输出时，每个 chunk 都触发 setState → React 重渲染，
 *   导致更新频率过高（每秒可达 30-60 次），远超屏幕刷新率（60fps）。
 *
 * 方案：
 *   chunk 到达时只写入 buffer（不触发渲染），通过双触发条件批量 flush：
 *   - 字符增量 ≥ charThreshold（默认 20）→ 立即 flush（防突发堆积）
 *   - 超过 interval ms（默认 50）没 flush → 定时器兜底（防慢吐卡住）
 *
 * 使用方式：
 *   1. start(onFlush) — 流开始时注册 flush 回调
 *   2. push(content)  — while 循环中替代直接 setState
 *   3. flushAll()     — 流结束时确保剩余内容输出
 *   4. reset()        — 中断/出错时清理
 */
export function useStreamBuffer(interval = 50, charThreshold = 20) {
  // 缓冲区：存储最新的完整文本（每次 push 传入的是累积全文，非增量）
  const contentRef = useRef('');
  // 定时器 ID：非空表示有待执行的 flush
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // flush 回调引用
  const flushFnRef = useRef<((content: string) => void) | null>(null);
  // 上次 flush 时的文本长度（用于计算字符增量）
  const lastFlushedLenRef = useRef(0);

  // ⚠️ 临时调试计数器（验证完删掉）
  const pushCountRef = useRef(0);
  const flushCountRef = useRef(0);

  /** 执行一次 flush（内部方法） */
  const doFlush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    flushCountRef.current++;
    lastFlushedLenRef.current = contentRef.current.length;
    flushFnRef.current?.(contentRef.current);
  }, []);

  /**
   * 启动缓冲区，注册 flush 回调
   */
  const start = useCallback((onFlush: (content: string) => void) => {
    contentRef.current = '';
    lastFlushedLenRef.current = 0;
    flushFnRef.current = onFlush;
  }, []);

  /**
   * 将内容写入缓冲区
   *
   * 双触发条件：
   *   1. 字符增量 ≥ charThreshold → 立即 flush（防止突发大段堆积）
   *   2. 超过 interval ms 没 flush → 定时器兜底 flush（防止慢吐时卡住）
   */
  const push = useCallback((content: string) => {
    contentRef.current = content;
    pushCountRef.current++;

    if (!flushFnRef.current) return;

    const delta = content.length - lastFlushedLenRef.current;
    if (delta >= charThreshold) {
      // 字符数达标 → 提前 flush，不等定时器
      doFlush();
    } else if (!timerRef.current) {
      // 没达标 → 安排定时器兜底
      timerRef.current = setTimeout(doFlush, interval);
    }
  }, [interval, charThreshold, doFlush]);

  /**
   * 立即 flush 剩余内容（流正常结束时调用）
   */
  const flushAll = useCallback(() => {
    doFlush();
    // ⚠️ 临时：输出统计结果
    console.log(`[StreamBuffer] push: ${pushCountRef.current} 次, flush: ${flushCountRef.current} 次, 节省渲染: ${pushCountRef.current - flushCountRef.current} 次`);
    pushCountRef.current = 0;
    flushCountRef.current = 0;
  }, [doFlush]);

  /**
   * 重置缓冲区（中断/出错时调用）
   */
  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    contentRef.current = '';
    lastFlushedLenRef.current = 0;
    flushFnRef.current = null;
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { start, push, flushAll, reset };
}
