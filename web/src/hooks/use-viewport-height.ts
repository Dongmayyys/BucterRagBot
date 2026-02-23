'use client';

import { useEffect } from 'react';

/**
 * 动态视口高度 Hook
 * 
 * 解决移动浏览器 vh 单位不准确的问题：
 * - 不同浏览器对 100vh 的解释不一致（地址栏、工具栏）
 * - dvh 单位支持度参差不齐
 * 
 * 原理：使用 window.innerHeight 获取真实可视区域高度，
 * 设置 CSS 变量 --vh，供样式使用。
 * 
 * 使用方式：
 * 1. 在顶层组件调用 useViewportHeight()
 * 2. CSS 中使用 calc(var(--vh, 1vh) * 100) 代替 100vh
 */
export function useViewportHeight() {
    useEffect(() => {
        const updateViewportHeight = () => {
            // window.innerHeight 返回的是真正的可视区域高度（像素）
            // 除以 100 得到 1vh 对应的像素值
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        // 初始设置
        updateViewportHeight();

        // 监听 resize（包括虚拟键盘弹出/收起）
        window.addEventListener('resize', updateViewportHeight);
        // 监听屏幕旋转
        window.addEventListener('orientationchange', updateViewportHeight);

        return () => {
            window.removeEventListener('resize', updateViewportHeight);
            window.removeEventListener('orientationchange', updateViewportHeight);
        };
    }, []);
}
