'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 打字机效果 Hook（基础版）
 */
export function useTypewriter(text: string, speed: number = 100) {
    const [displayText, setDisplayText] = useState('');
    const [isTyping, setIsTyping] = useState(true);

    useEffect(() => {
        setDisplayText('');
        setIsTyping(true);

        if (!text) {
            setIsTyping(false);
            return;
        }

        let currentIndex = 0;
        const timer = setInterval(() => {
            if (currentIndex < text.length) {
                setDisplayText(text.slice(0, currentIndex + 1));
                currentIndex++;
            } else {
                setIsTyping(false);
                clearInterval(timer);
            }
        }, speed);

        return () => clearInterval(timer);
    }, [text, speed]);

    return { displayText, isTyping };
}

/**
 * 打字机效果 Hook（支持删除和切换）
 * 
 * 用于彩蛋效果：先删除当前文字，再打出新文字
 */
export function useTypewriterWithTransition(
    initialText: string,
    speed: number = 80
) {
    const [displayText, setDisplayText] = useState('');
    const [isTyping, setIsTyping] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const targetTextRef = useRef(initialText);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // 清理定时器
    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // 打字效果
    const typeText = useCallback((text: string) => {
        clearTimer();
        setIsTyping(true);
        setIsDeleting(false);
        let index = 0;

        timerRef.current = setInterval(() => {
            if (index < text.length) {
                setDisplayText(text.slice(0, index + 1));
                index++;
            } else {
                setIsTyping(false);
                clearTimer();
            }
        }, speed);
    }, [speed, clearTimer]);

    // 删除效果
    const deleteText = useCallback((onComplete: () => void) => {
        clearTimer();
        setIsDeleting(true);
        setIsTyping(true);

        timerRef.current = setInterval(() => {
            setDisplayText(prev => {
                if (prev.length > 0) {
                    return prev.slice(0, -1);
                } else {
                    setIsDeleting(false);
                    clearTimer();
                    onComplete();
                    return '';
                }
            });
        }, speed / 2);  // 删除速度更快
    }, [speed, clearTimer]);

    // 切换到新文字（先删除再打字）
    const transitionTo = useCallback((newText: string) => {
        targetTextRef.current = newText;
        deleteText(() => {
            typeText(newText);
        });
    }, [deleteText, typeText]);

    // 初始打字
    useEffect(() => {
        typeText(initialText);
        return clearTimer;
    }, []);  // 只在挂载时执行一次

    return {
        displayText,
        isTyping,
        isDeleting,
        transitionTo,
    };
}

/**
 * 时间段类型
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * 获取当前时间段
 */
export function getTimeOfDay(): TimeOfDay {
    const hour = new Date().getHours();

    if (hour >= 2 && hour < 8) {
        return 'night';
    } else if (hour >= 8 && hour < 12) {
        return 'morning';
    } else if (hour >= 12 && hour < 18) {
        return 'afternoon';
    } else {
        return 'evening';
    }
}

/**
 * 根据时间段获取问候语
 */
export function getGreeting(timeOfDay: TimeOfDay): string {
    switch (timeOfDay) {
        case 'morning':
            return '早上好, Bucter';
        case 'afternoon':
            return '下午好, Bucter';
        case 'evening':
            return '晚上好, Bucter';
        case 'night':
            return 'Hi, Bucter';
    }
}

/**
 * 获取副标题
 */
export function getSubtitle(timeOfDay: TimeOfDay): string {
    if (timeOfDay === 'night') {
        return "Burning the midnight oil? I'm here to help.";
    }
    return '我可以帮你查询校园相关信息';
}
