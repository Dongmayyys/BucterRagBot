'use client';

import { useEffect } from 'react';

/**
 * 可视视口高度 Hook
 * 
 * 使用 visualViewport API 获取真实的可视区域高度（排除虚拟键盘）。
 * 比 window.innerHeight 更精确，在键盘弹出时会正确更新。
 * 
 * 使用方式：
 * 1. 在顶层组件调用 useVisualViewport()
 * 2. CSS 中使用 var(--visual-viewport-height, 100vh)
 */
export function useVisualViewport() {
    useEffect(() => {
        const viewport = window.visualViewport;

        // 如果不支持 visualViewport API，跳过
        if (!viewport) {
            console.warn('visualViewport API not supported');
            return;
        }

        const updateHeight = () => {
            // 设置可视区域高度（排除键盘）
            document.documentElement.style.setProperty(
                '--visual-viewport-height',
                `${viewport.height}px`
            );
        };

        // 初始设置
        updateHeight();

        // 监听视口变化（键盘弹出/收起）
        viewport.addEventListener('resize', updateHeight);
        viewport.addEventListener('scroll', updateHeight);

        return () => {
            viewport.removeEventListener('resize', updateHeight);
            viewport.removeEventListener('scroll', updateHeight);
        };
    }, []);
}
