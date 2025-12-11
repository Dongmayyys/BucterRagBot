'use client';

import { Check, Loader2, X, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RAG 处理流程指示器 - 四阶段版本
 * 
 * 阶段：
 * 1. 思考 (thinking) - 意图识别
 * 2. 查询 (searching) - 向量检索
 * 3. 整理 (organizing) - Rerank
 * 4. 回复 (generating) - LLM 生成
 * 
 * 状态：
 * - pending：灰色空心圆
 * - active：旋转动画
 * - done：绿色打勾
 * - failed：红色打叉（查询无结果）
 * - skipped：灰色圆圈带斜杠（闲聊时跳过）
 */

export type ProcessingPhase = 'idle' | 'thinking' | 'searching' | 'organizing' | 'generating' | 'done' | 'error';

interface ProcessingStepsProps {
    phase: ProcessingPhase;
    hasResults?: boolean; // 是否找到了 citation
    isChat?: boolean; // 是否为闲聊模式（跳过查询/整理）
}

const steps = [
    { key: 'thinking', label: '思考', icon: '🤔', canSkip: false, affectedByResults: false },
    { key: 'searching', label: '查询', icon: '🔍', canSkip: true, affectedByResults: true },
    { key: 'organizing', label: '整理', icon: '📚', canSkip: true, affectedByResults: true },
    { key: 'generating', label: '回复', icon: '✍️', canSkip: false, affectedByResults: false },
] as const;

type StepKey = typeof steps[number]['key'];
type StepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

function getStepStatus(
    stepKey: StepKey,
    phase: ProcessingPhase,
    isChat: boolean,
    hasResults: boolean
): StepStatus {
    // 错误状态：所有步骤都显示失败
    if (phase === 'error') {
        return 'failed';
    }

    const phaseOrder: Record<ProcessingPhase, number> = {
        idle: -1,
        thinking: 0,
        searching: 1,
        organizing: 2,
        generating: 3,
        done: 4,
        error: -1,  // error 不参与顺序比较
    };

    const stepOrder: Record<StepKey, number> = {
        thinking: 0,
        searching: 1,
        organizing: 2,
        generating: 3,
    };

    const currentPhaseIndex = phaseOrder[phase];
    const stepIndex = stepOrder[stepKey];

    // 闲聊模式：查询和整理步骤跳过
    const step = steps.find(s => s.key === stepKey)!;
    if (isChat && step.canSkip && currentPhaseIndex > stepIndex) {
        return 'skipped';
    }

    // 查询模式：根据结果判断
    if (currentPhaseIndex > stepIndex) {
        // 如果没有结果且该步骤受结果影响
        if (!hasResults && step.affectedByResults) {
            return 'failed';
        }
        return 'done';
    } else if (currentPhaseIndex === stepIndex) {
        return 'active';
    }
    return 'pending';
}

export function ProcessingSteps({ phase, hasResults = true, isChat = false }: ProcessingStepsProps) {
    if (phase === 'idle') {
        return null;
    }

    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
            {steps.map((step, idx) => {
                const status = getStepStatus(step.key, phase, isChat, hasResults);

                return (
                    <div key={step.key} className="flex items-center gap-1">
                        {/* 步骤内容 */}
                        <span className={cn(
                            'flex items-center gap-1 transition-colors',
                            status === 'active' && 'text-foreground font-medium',
                            (status === 'done' || status === 'failed') && 'text-muted-foreground',
                            status === 'skipped' && 'text-muted-foreground/50'
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
                            {status === 'done' && (
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500 text-white">
                                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                                </span>
                            )}
                            {status === 'failed' && (
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-destructive text-white">
                                    <X className="w-2.5 h-2.5" strokeWidth={3} />
                                </span>
                            )}
                            {status === 'skipped' && (
                                <MinusCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
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
