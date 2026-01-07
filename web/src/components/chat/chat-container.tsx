'use client';

import { Citation } from '@/lib/types';
import { SourcePanelContent } from './source-panel-content';

interface ChatContainerProps {
    children: React.ReactNode;
    citation: Citation | null;
    onCloseCitation: () => void;
}

export function ChatContainer({ children, citation, onCloseCitation }: ChatContainerProps) {
    return (
        <div className="flex-1 flex overflow-hidden min-h-0">
            {/* 主聊天区域 - 点击关闭面板 */}
            <div
                className="flex-1 flex flex-col transition-all duration-300 ease-out overflow-hidden"
                onClick={() => citation && onCloseCitation()}
            >
                {children}
            </div>

            {/* PC 端：右侧面板 */}
            <aside
                className={`
                    hidden md:flex md:flex-col
                    overflow-hidden
                    transition-all duration-300 ease-out
                    ${citation ? 'w-96 ml-2' : 'w-0'}
                `}
                onClick={(e) => e.stopPropagation()}
            >
                {citation && (
                    <div className="h-full bg-background border border-border rounded-lg shadow-lg overflow-hidden m-2">
                        <SourcePanelContent citation={citation} />
                    </div>
                )}
            </aside>
        </div>
    );
}
