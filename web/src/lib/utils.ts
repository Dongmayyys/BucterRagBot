import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Supabase Storage 配置
export const SUPABASE_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SNAPSHOT_BUCKET = 'pdf-snapshots';

// 文档 ID → Hash ID 映射 (硬编码，与 upload_snapshots.py 一致)
// TODO: 后续可从 API 获取或在上传时存入数据库
const DOCUMENT_HASH_MAP: Record<string, string> = {
  '2025-本科生学习指南': 'e60d51e8',
  '2025-本科生手册': 'fb13b00c',
};

/**
 * 获取文档的 hash ID (用于构建 Storage 路径)
 */
export function getDocumentHashId(documentId: string): string {
  return DOCUMENT_HASH_MAP[documentId] || 'unknown';
}

/**
 * 构建 PDF 页面快照的 URL
 */
export function getSnapshotUrl(documentId: string, pageNumber: number): string {
  const hashId = getDocumentHashId(documentId);
  return `${SUPABASE_STORAGE_URL}/storage/v1/object/public/${SNAPSHOT_BUCKET}/${hashId}/page_${pageNumber}.webp`;
}
