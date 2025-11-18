import { useRef, useState, useEffect, useLayoutEffect, useCallback, RefObject } from 'react';

// ===== 配置常量 =====
const BOTTOM_THRESHOLD = 100; // 底部判定阈值 (px)，用户距底部 <= 100px 视为"在底部"
const WHEEL_DEBOUNCE_MS = 150; // 滚轮事件防抖时间 (ms)

/**
 * 智能滚底 Hook - 实现类似微信/ChatGPT 的"智能自动滚底"体验
 * 
 * ## 核心行为
 * | 场景                       | 行为                     |
 * |---------------------------|-------------------------|
 * | isStreaming + 用户在底部   | ✅ 自动滚动到底部         |
 * | isStreaming + 用户在操作   | ❌ 暂停自动滚动，防止"打架" |
 * | 用户向上翻看历史           | ❌ 保持当前位置，不打断阅读 |
 * | 非 streaming 状态          | ❌ 不自动滚动             |
 * 
 * ## 事件驱动 API
 * - markUnread(): 外部调用，标记有未读消息（如 streaming 结束时）
 * - scrollToBottom(): 用户点击按钮或自动吸附时调用，清除未读标记
 * 
 * @param isStreaming - 是否正在流式输出，只有为 true 时才启用自动滚动
 */
export function useScrollToBottom<T extends HTMLElement = HTMLDivElement>(
    isStreaming: boolean = false
): [
        containerRef: RefObject<T | null>,
        endRef: RefObject<HTMLDivElement | null>,
        isAtBottom: boolean,
        scrollToBottom: () => void,
        hasUnread: boolean,
        markUnread: () => void  // 事件驱动：由外部调用标记未读
    ] {
    // ===== Refs =====
    const containerRef = useRef<T | null>(null);
    const endRef = useRef<HTMLDivElement | null>(null);

    // ===== 双轨制状态 =====
    const [isAtBottom, setIsAtBottom] = useState(true);
    const isAtBottomRef = useRef(true);
    const isUserInteractingRef = useRef(false);
    const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 💡 追踪"应该跟随"状态
    const shouldFollowRef = useRef(true);

    // 💡 isStreaming 的 Ref 版本，供闭包内读取最新值
    // 使用 useLayoutEffect 确保在 DOM 更新后、绘制前同步更新
    const isStreamingRef = useRef(isStreaming);
    useLayoutEffect(() => {
        isStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // 💡 未读消息状态
    const [hasUnread, setHasUnread] = useState(false);

    /**
     * 计算当前是否在底部
     */
    const calculateIsAtBottom = useCallback(() => {
        const container = containerRef.current;
        if (!container) return true;
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distance <= BOTTOM_THRESHOLD;
    }, []);

    /**
     * 更新底部状态（同步双轨）
     */
    const updateIsAtBottom = useCallback((value: boolean) => {
        isAtBottomRef.current = value;
        setIsAtBottom(value);
    }, []);

    /**
     * 手动滚动到底部
     */
    const scrollToBottom = useCallback(() => {
        const container = containerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
            updateIsAtBottom(true);
            shouldFollowRef.current = true;
            setHasUnread(false);  // 清除未读标记
        }
    }, [updateIsAtBottom]);

    /**
     * 标记有未读消息（事件驱动：由外部调用）
     * 只有当用户不在底部时才标记
     */
    const markUnread = useCallback(() => {
        if (!isAtBottomRef.current) {
            setHasUnread(true);
        }
    }, []);

    /**
     * 条件自动滚动
     */
    const maybeAutoScroll = useCallback(() => {
        // 只有在流式输出 + 应该跟随 + 用户未交互时才自动滚动
        if (isStreamingRef.current && shouldFollowRef.current && !isUserInteractingRef.current) {
            const container = containerRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
                updateIsAtBottom(true);
            }
        }
    }, [updateIsAtBottom]);

    useEffect(() => {
        const container = containerRef.current;
        const sentinel = endRef.current;
        if (!container || !sentinel) return;

        // ===== 1. Scroll 事件：实时更新 isAtBottom =====
        const handleScroll = () => {
            const atBottom = calculateIsAtBottom();

            // 更新 UI 状态
            if (atBottom !== isAtBottomRef.current) {
                updateIsAtBottom(atBottom);
            }

            // 用户主动交互时更新 shouldFollowRef
            if (isUserInteractingRef.current) {
                shouldFollowRef.current = atBottom;
            }

            // 💡 用户滚到底部时，清除未读标记
            if (atBottom) {
                setHasUnread(false);
            }
        };

        // ===== 2. 交互开始 =====
        const handleInteractionStart = () => {
            isUserInteractingRef.current = true;
        };

        // ===== 3. 交互结束 =====
        const handleInteractionEnd = () => {
            isUserInteractingRef.current = false;
            const atBottom = calculateIsAtBottom();

            if (atBottom) {
                shouldFollowRef.current = true;
                if (isStreamingRef.current) {
                    scrollToBottom();
                }
            } else {
                shouldFollowRef.current = false;
            }

            updateIsAtBottom(atBottom);
        };

        // ===== 4. 滚轮事件：防抖处理 =====
        const handleWheel = () => {
            isUserInteractingRef.current = true;
            if (wheelTimeoutRef.current) {
                clearTimeout(wheelTimeoutRef.current);
            }
            wheelTimeoutRef.current = setTimeout(() => {
                handleInteractionEnd();
            }, WHEEL_DEBOUNCE_MS);
        };

        // ===== 5. ResizeObserver =====
        const resizeObserver = new ResizeObserver(() => {
            maybeAutoScroll();
        });
        resizeObserver.observe(sentinel);

        // ===== 6. 移动端 visualViewport 支持 =====
        const viewport = window.visualViewport;
        const handleViewportResize = () => {
            handleScroll();
        };

        // ===== 绑定事件 =====
        container.addEventListener('scroll', handleScroll, { passive: true });
        container.addEventListener('touchstart', handleInteractionStart, { passive: true });
        container.addEventListener('touchend', handleInteractionEnd);
        container.addEventListener('mousedown', handleInteractionStart, { passive: true });
        container.addEventListener('mouseup', handleInteractionEnd);
        container.addEventListener('wheel', handleWheel, { passive: true });
        viewport?.addEventListener('resize', handleViewportResize);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            container.removeEventListener('touchstart', handleInteractionStart);
            container.removeEventListener('touchend', handleInteractionEnd);
            container.removeEventListener('mousedown', handleInteractionStart);
            container.removeEventListener('mouseup', handleInteractionEnd);
            container.removeEventListener('wheel', handleWheel);
            viewport?.removeEventListener('resize', handleViewportResize);
            resizeObserver.disconnect();
            if (wheelTimeoutRef.current) {
                clearTimeout(wheelTimeoutRef.current);
            }
        };
        // 💡 添加 isStreaming 到依赖，确保从空状态切换到有消息时重新执行
    }, [calculateIsAtBottom, updateIsAtBottom, scrollToBottom, maybeAutoScroll, isStreaming]);

    // 💡 当 streaming 开始时，如果用户在底部，重置跟随意图
    useEffect(() => {
        if (isStreaming && calculateIsAtBottom()) {
            shouldFollowRef.current = true;
        }
    }, [isStreaming, calculateIsAtBottom]);

    return [containerRef, endRef, isAtBottom, scrollToBottom, hasUnread, markUnread];
}
