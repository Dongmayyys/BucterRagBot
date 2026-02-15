'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { TimeOfDay, getGreeting, getSubtitle } from './use-typewriter';

/**
 * 彩蛋 Hook - 管理欢迎页彩蛋交互逻辑
 * 
 * 功能：
 * - Emoji 点击动画
 * - 5 次点击触发彩蛋
 * - 怪兽图片张嘴动画
 * - 图片预加载
 */

// 动画配置类型
interface AnimationConfig {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
}

// Emoji 动画映射
const EMOJI_ANIMATIONS: Record<string, AnimationConfig> = {
    '☀️': {  // 太阳：旋转 + 放大
        keyframes: [
            { transform: 'scale(1) rotate(0deg)' },
            { transform: 'scale(1.3) rotate(180deg)' },
            { transform: 'scale(1) rotate(360deg)' },
        ],
        options: { duration: 600, easing: 'ease-out' },
    },
    '☕': {  // 咖啡：上下晃动
        keyframes: [
            { transform: 'translateY(0) rotate(0deg)' },
            { transform: 'translateY(-4px) rotate(-10deg)' },
            { transform: 'translateY(-4px) rotate(10deg)' },
            { transform: 'translateY(0) rotate(0deg)' },
        ],
        options: { duration: 500, easing: 'ease-in-out' },
    },
    '🌙': {  // 月亮：左右摇摆
        keyframes: [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-15deg)' },
            { transform: 'rotate(15deg)' },
            { transform: 'rotate(0deg)' },
        ],
        options: { duration: 500, easing: 'ease-in-out' },
    },
    '🦉': {  // 猫头鹰：左右看
        keyframes: [
            { transform: 'scaleX(1)' },
            { transform: 'scaleX(-1)' },
            { transform: 'scaleX(1)' },
        ],
        options: { duration: 400, easing: 'ease-in-out' },
    },
};

// 默认动画
const DEFAULT_ANIMATION: AnimationConfig = {
    keyframes: [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-5deg)' },
        { transform: 'rotate(5deg)' },
        { transform: 'rotate(0deg)' },
    ],
    options: { duration: 500, easing: 'ease-in-out' },
};

// 彩蛋欢迎语
export const EASTER_EGG_GREETING = 'Welcome to BUCT';
export const EASTER_EGG_SUBTITLE = 'You found a hidden easter egg!';

// 时间段 Emoji 映射
const TIME_EMOJI_MAP: Record<TimeOfDay, string> = {
    morning: '☀️',
    afternoon: '☕',
    evening: '🌙',
    night: '🦉',
};

interface UseEasterEggOptions {
    timeOfDay: TimeOfDay;
    /** 受控模式：外部传入的彩蛋状态 */
    isEasterEgg?: boolean;
    /** 状态变化回调 */
    onEasterEggChange?: (isActive: boolean) => void;
    /** 触发彩蛋时的回调（用于切换打字机文字） */
    onTrigger?: () => void;
}

interface UseEasterEggReturn {
    // 状态
    isEasterEgg: boolean;
    isMouthOpen: boolean;
    currentEmoji: string;
    greeting: string;
    subtitle: string;
    easterEggGreeting: string;
    easterEggSubtitle: string;

    // Refs
    emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
    monsterRef: React.RefObject<HTMLImageElement | null>;

    // 处理函数
    handleEmojiClick: () => void;
    handleMonsterClick: () => void;

    // 动画
    getClickAnimation: (emoji: string) => AnimationConfig;
}

export function useEasterEgg({
    timeOfDay,
    isEasterEgg: propIsEasterEgg,
    onEasterEggChange,
    onTrigger,
}: UseEasterEggOptions): UseEasterEggReturn {
    // 状态
    const [localIsEasterEgg, setLocalIsEasterEgg] = useState(false);
    const [isMouthOpen, setIsMouthOpen] = useState(false);

    // 混合状态：优先使用 prop
    const isEasterEgg = propIsEasterEgg ?? localIsEasterEgg;
    const setIsEasterEgg = useCallback((val: boolean) => {
        setLocalIsEasterEgg(val);
        onEasterEggChange?.(val);
    }, [onEasterEggChange]);

    // Refs
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const monsterRef = useRef<HTMLImageElement>(null);
    const isMonsterAnimating = useRef(false);
    const lastClickTimeRef = useRef<number>(0);
    const clickCountRef = useRef(0);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 时间相关
    const timeEmoji = TIME_EMOJI_MAP[timeOfDay];
    const currentEmoji = isEasterEgg ? '' : timeEmoji;
    const greeting = useMemo(() => getGreeting(timeOfDay), [timeOfDay]);
    const subtitle = useMemo(() => getSubtitle(timeOfDay), [timeOfDay]);

    // 获取点击动画
    const getClickAnimation = useCallback((emoji: string): AnimationConfig => {
        return EMOJI_ANIMATIONS[emoji] || DEFAULT_ANIMATION;
    }, []);

    // Emoji 点击处理
    const handleEmojiClick = useCallback(() => {
        // 播放点击动效
        if (emojiButtonRef.current) {
            const anim = getClickAnimation(currentEmoji);
            emojiButtonRef.current.animate(anim.keyframes, anim.options);
            lastClickTimeRef.current = Date.now();
        }

        // 累加点击计数
        clickCountRef.current += 1;

        // 首次点击即预加载怪兽图片
        if (clickCountRef.current === 1) {
            new Image().src = '/monster.png';
            new Image().src = '/monster-open.png';
        }

        // 检测彩蛋（5次触发）
        if (clickCountRef.current >= 5 && !isEasterEgg) {
            setIsEasterEgg(true);
            onTrigger?.();
            clickCountRef.current = 0;
        }
    }, [getClickAnimation, currentEmoji, isEasterEgg, setIsEasterEgg, onTrigger]);

    // 怪兽点击处理（张嘴动画）
    const handleMonsterClick = useCallback(() => {
        // 防抖：动画进行中忽略点击
        if (isMonsterAnimating.current) return;

        if (monsterRef.current) {
            isMonsterAnimating.current = true;
            monsterRef.current.animate(
                [
                    { transform: 'scale(1)', offset: 0 },
                    { transform: 'scale(1.3)', offset: 0.3 },
                    { transform: 'scale(1.3)', offset: 0.7 },
                    { transform: 'scale(1)', offset: 1 },
                ],
                { duration: 600, easing: 'ease-in-out' }
            );
            // 放大时张嘴
            setTimeout(() => setIsMouthOpen(true), 180);
            // 缩小后闭嘴，并解锁防抖
            setTimeout(() => {
                setIsMouthOpen(false);
                isMonsterAnimating.current = false;
            }, 600);
        }
    }, []);

    // 空闲动效
    useEffect(() => {
        const playIdleAnim = () => {
            // 点击后 1 秒内跳过空闲动效
            if (Date.now() - lastClickTimeRef.current < 1000) return;
            if (emojiButtonRef.current && !isEasterEgg) {
                emojiButtonRef.current.animate(
                    DEFAULT_ANIMATION.keyframes,
                    DEFAULT_ANIMATION.options
                );
            }
        };

        // 每 5 秒播放一次
        idleTimerRef.current = setInterval(playIdleAnim, 5000);

        return () => {
            if (idleTimerRef.current) clearInterval(idleTimerRef.current);
        };
    }, [isEasterEgg]);

    return {
        isEasterEgg,
        isMouthOpen,
        currentEmoji,
        greeting,
        subtitle,
        easterEggGreeting: EASTER_EGG_GREETING,
        easterEggSubtitle: EASTER_EGG_SUBTITLE,
        emojiButtonRef,
        monsterRef,
        handleEmojiClick,
        handleMonsterClick,
        getClickAnimation,
    };
}
