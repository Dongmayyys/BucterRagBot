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
            {/* 主聊天区域 */}
            <div
                className="flex-1 flex flex-col overflow-hidden"
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
            >
                {citation && (
                    <div className="h-full bg-background border border-border rounded-lg shadow-lg overflow-hidden m-2">
                        <SourcePanelContent key={citation.id} citation={citation} onClose={onCloseCitation} />
                    </div>
                )}
            </aside>
        </div>
    );
}
