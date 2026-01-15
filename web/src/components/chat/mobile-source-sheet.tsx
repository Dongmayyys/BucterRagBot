'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Citation } from '@/lib/types';
import { SourcePanelContent } from './source-panel-content';

interface MobileSourceSheetProps {
    citation: Citation | null;
    onClose: () => void;
}

export function MobileSourceSheet({ citation, onClose }: MobileSourceSheetProps) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
        <Sheet open={isMobile && !!citation} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="bottom" className="h-[70vh]">
                <SheetTitle className="sr-only">原文详情</SheetTitle>
                <SheetDescription className="sr-only">查看引用来源的原文内容</SheetDescription>
                <SourcePanelContent key={citation?.id} citation={citation} />
            </SheetContent>
        </Sheet>
    );
}
