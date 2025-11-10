'use client';

import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RAG 处理流程指示器
 * 
 * 显示三个阶段的进度：
 * 1. 查找资料 (searching)
 * 2. 整理资料 (organizing) 
 * 3. 生成回复 (generating)
 * 
 * 状态说明：
 * - 等待中：灰色圆圈
 * - 进行中：旋转动画
 * - 已完成且有结果：绿色打勾 ✓
 * - 已完成但无结果：红色打叉 ✗（仅前两步）
 */

export type ProcessingPhase = 'idle' | 'searching' | 'organizing' | 'generating' | 'done';

interface ProcessingStepsProps {
    phase: ProcessingPhase;
    hasResults?: boolean; // 是否找到了 citation
}

const steps = [
    { key: 'searching', label: '查找资料', icon: '🔍', affectedByResults: true },
    { key: 'organizing', label: '整理资料', icon: '📚', affectedByResults: true },
    { key: 'generating', label: '生成回复', icon: '✍️', affectedByResults: false },
] as const;

type StepKey = typeof steps[number]['key'];

function getStepStatus(stepKey: StepKey, phase: ProcessingPhase): 'pending' | 'active' | 'done' {
    const phaseOrder: Record<ProcessingPhase, number> = {
        idle: -1,
        searching: 0,
        organizing: 1,
        generating: 2,
        done: 3,
    };

    const stepOrder: Record<StepKey, number> = {
        searching: 0,
        organizing: 1,
        generating: 2,
    };

    const currentPhaseIndex = phaseOrder[phase];
    const stepIndex = stepOrder[stepKey];

    if (currentPhaseIndex > stepIndex) {
        return 'done';
    } else if (currentPhaseIndex === stepIndex) {
        return 'active';
    }
    return 'pending';
}

export function ProcessingSteps({ phase, hasResults = true }: ProcessingStepsProps) {
    // idle 状态不显示
    if (phase === 'idle') {
        return null;
    }

    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
            {steps.map((step, idx) => {
                const status = getStepStatus(step.key, phase);
                // 如果没有结果且该步骤受影响，显示失败图标
                const showFailed = status === 'done' && !hasResults && step.affectedByResults;

                return (
                    <div key={step.key} className="flex items-center gap-1">
                        {/* 步骤内容 */}
                        <span className={cn(
                            'flex items-center gap-1 transition-colors',
                            status === 'active' && 'text-foreground font-medium',
                            status === 'done' && !showFailed && 'text-muted-foreground',
                            showFailed && 'text-destructive/70'
                        )}>
                            <span>{step.icon}</span>
                            <span>{step.label}</span>
                        </span>

                        {/* 状态图标 */}
                        <span className="ml-0.5">
                            {status === 'pending' && (
                                <span className="inline-block w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                            )}
                            {status === 'active' && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            )}
                            {status === 'done' && !showFailed && (
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500 text-white">
                                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                                </span>
                            )}
                            {showFailed && (
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-destructive text-white">
                                    <X className="w-2.5 h-2.5" strokeWidth={3} />
                                </span>
                            )}
                        </span>

                        {/* 箭头分隔符 */}
                        {idx < steps.length - 1 && (
                            <span className="text-muted-foreground/50 mx-1">→</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
