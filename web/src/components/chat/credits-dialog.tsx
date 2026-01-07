'use client';

import { Heart } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface CreditsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreditsDialog({ open, onOpenChange }: CreditsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md w-[90%] md:w-full rounded-2xl md:rounded-lg">
                <DialogHeader>
                    {/* 现代徽标风格 */}
                    <DialogTitle className="flex items-center pb-4">
                        <span className="text-xl font-bold mr-1">致谢名单</span>
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400 text-xs font-medium">
                            <span>Thanks</span>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto pr-2">
                    {/* 1. 赞助商 */}
                    <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1.5">
                            <span>💰</span> 赞助商
                        </h4>
                        <ul className="grid grid-cols-2 gap-2 text-muted-foreground">
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center gap-0.5">
                                <span className="font-medium text-foreground">Google</span>
                                <span className="text-[10px] text-muted-foreground/80">
                                    <span className="line-through opacity-60">赞助</span> 免费的 PRO
                                </span>
                            </li>
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center gap-0.5">
                                <span className="font-medium text-foreground">SiliconFlow</span>
                                <span className="text-[10px] text-muted-foreground/80">
                                    <span className="line-through opacity-60">赞助</span> 免费的 API
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* 2. 开发者团队 */}
                    <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1.5">
                            <span>👨‍💻</span> 开发者
                        </h4>
                        <ul className="grid grid-cols-2 gap-2 text-muted-foreground">
                            <li className="col-span-2 bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center">
                                <span className="font-medium text-foreground">Dongmay</span>
                            </li>
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center">
                                <span className="font-medium text-foreground">Claude</span>
                            </li>
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center">
                                <span className="font-medium text-foreground">Gemini</span>
                            </li>
                        </ul>
                    </div>

                    {/* 3. 部署与服务 */}
                    <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1.5">
                            <span>☁️</span> 基础设施
                        </h4>
                        <ul className="grid grid-cols-2 gap-2 text-muted-foreground">
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center gap-0.5">
                                <span className="font-medium text-foreground">Supabase</span>
                                <span className="text-[10px] text-muted-foreground/80">数据库</span>
                            </li>
                            <li className="bg-muted/30 p-2 rounded text-xs flex flex-col items-center justify-center gap-0.5">
                                <span className="font-medium text-foreground">Zeabur</span>
                                <span className="text-[10px] text-muted-foreground/80">前端托管</span>
                            </li>
                        </ul>
                    </div>

                    {/* 4. 开源社区 */}
                    <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1.5">
                            <span>🌍</span> 开源社区
                        </h4>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                            特别感谢 Next.js, Tailwind CSS, shadcn/ui 等优秀开源项目，致敬每一位开源贡献者
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
