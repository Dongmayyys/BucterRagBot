'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

/**
 * 侧边栏状态管理 Hook
 * 用于控制响应式布局中侧边栏的展开/收起
 */

interface SidebarContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
    open: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <SidebarContext.Provider
            value={{
                isOpen,
                toggle: () => setIsOpen((prev) => !prev),
                close: () => setIsOpen(false),
                open: () => setIsOpen(true),
            }}
        >
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
