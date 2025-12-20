# -*- coding: utf-8 -*-
"""
语义流处理脚本 v2 - 全文提取 + Q&A 切分
==========================================

流程：
1. 使用 pymupdf4llm 按页提取 (带页码信息)
2. 合并为全文
3. Q&A 正则切分 (复用检验过的策略)
4. 每个 chunk 标记页码范围和面包屑

使用方法:
    python extract_semantic_v2.py --dry-run          # 预览
    python extract_semantic_v2.py --crop 0.08        # 调整裁切比例
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple

import fitz  # PyMuPDF
import pymupdf4llm


# ============================================================================
# 配置
# ============================================================================

PDF_DIR = "data"
OUTPUT_DIR = "chunks"
PREVIEW_FILE = "docs/preview_semantic_v2.txt"

# 裁切参数 (顶部+底部各裁切的比例)
DEFAULT_CROP_RATIO = 0.10  # 10% 能可靠裁掉页眉页脚和页码


# ============================================================================
# 大纲解析 (面包屑)
# ============================================================================

def extract_toc_mapping(doc: fitz.Document) -> Dict[int, List[str]]:
    """从 PDF 大纲构建页码到面包屑的映射"""
    toc = doc.get_toc()
    if not toc:
        return {}
    
    page_to_breadcrumb: Dict[int, List[str]] = {}
    current_path: List[str] = []
    
    for level, title, target_page in toc:
        while len(current_path) >= level:
            current_path.pop()
        current_path.append(title.strip())
        page_to_breadcrumb[target_page] = current_path.copy()
    
    return page_to_breadcrumb


def get_breadcrumb_for_page(page_num: int, toc_mapping: Dict[int, List[str]]) -> List[str]:
    """获取指定页面的面包屑"""
    if not toc_mapping:
        return []
    valid_pages = [p for p in toc_mapping.keys() if p <= page_num]
    if not valid_pages:
        return []
    return toc_mapping[max(valid_pages)]


# ============================================================================
# 文本提取 (使用 pymupdf4llm + 裁切)
# ============================================================================

def extract_pages_with_crop(
    pdf_path: str,
    crop_ratio: float = DEFAULT_CROP_RATIO
) -> Tuple[List[Dict], int, Dict[int, List[str]]]:
    """
    提取 PDF 每页文本 (带裁切)
    
    Returns:
        (pages_data, total_pages, toc_mapping)
    """
    doc = fitz.open(pdf_path)
    document_id = Path(pdf_path).stem
    total_pages = len(doc)
    
    print(f"\n📄 处理: {pdf_path}")
    print(f"   共 {total_pages} 页, 裁切: {crop_ratio*100:.0f}%")
    
    # 解析大纲
    toc_mapping = extract_toc_mapping(doc)
    if toc_mapping:
        print(f"   📑 解析大纲: {len(toc_mapping)} 个章节")
    
    pages_data = []
    
    for page_num in range(total_pages):
        page = doc[page_num]
        page_number = page_num + 1  # 1-indexed
        
        # CropBox 裁切
        page_rect = page.rect
        margin = page_rect.height * crop_ratio
        clip = fitz.Rect(0, margin, page_rect.width, page_rect.height - margin)
        text = page.get_text("text", clip=clip).strip()
        
        # 获取面包屑
        breadcrumb = get_breadcrumb_for_page(page_number, toc_mapping)
        
        pages_data.append({
            "page_number": page_number,
            "text": text,
            "breadcrumb": breadcrumb,
            "text_length": len(text)
        })
    
    doc.close()
    print(f"   ✓ 提取完成")
    
    return pages_data, total_pages, toc_mapping


# ============================================================================
# Q&A 正则切分 (复用现有策略)
# ============================================================================

# Q&A 格式: "1. 什么是..." 或 "**1. 问题**"
# 匹配: 换行后跟数字和点
QA_PATTERN = r'(\n\d+\.\s+)'


def split_by_qa_regex(
    pages_data: List[Dict],
    document_id: str,
    total_pages: int
) -> List[Dict]:
    """
    使用 Q&A 正则切分全文
    
    关键: 每个 chunk 需要标记其所属页码
    """
    # 1. 合并全文，同时记录每个位置对应的页码
    full_text = ""
    position_to_page = []  # position_to_page[char_index] = page_number
    
    for page in pages_data:
        start_pos = len(full_text)
        full_text += page["text"] + "\n\n"
        end_pos = len(full_text)
        
        # 记录这段文本的每个字符属于哪一页
        for _ in range(start_pos, end_pos):
            position_to_page.append(page["page_number"])
    
    # 2. Q&A 正则切分
    parts = re.split(QA_PATTERN, full_text)
    
    chunks = []
    chunk_index = 0
    current_pos = 0
    
    # 处理前言部分
    if parts[0].strip():
        intro_text = parts[0].strip()
        intro_page = position_to_page[0] if position_to_page else 1
        chunks.append({
            "document_id": document_id,
            "chunk_index": chunk_index,
            "page_number": intro_page,
            "total_pages": total_pages,
            "breadcrumb": [],
            "title": "【前言/目录】",
            "content": intro_text,
            "content_length": len(intro_text),
            "source": f"{document_id}.pdf",
            "strategy": "qa_regex"
        })
        chunk_index += 1
        current_pos = len(parts[0])
    
    # 处理 Q&A 对
    for i in range(1, len(parts), 2):
        header = parts[i]
        content = parts[i+1] if i+1 < len(parts) else ""
        full_chunk = header.strip() + content.strip()
        
        if not full_chunk:
            continue
        
        # 确定这个 chunk 属于哪一页
        chunk_start_pos = full_text.find(header, current_pos)
        if chunk_start_pos >= 0 and chunk_start_pos < len(position_to_page):
            page_number = position_to_page[chunk_start_pos]
        else:
            page_number = 1
        
        # 获取面包屑 (从对应页获取)
        breadcrumb = []
        for page in pages_data:
            if page["page_number"] == page_number:
                breadcrumb = page["breadcrumb"]
                break
        
        # 提取问题标题
        lines = full_chunk.split('\n')
        title = lines[0].replace('**', '').strip() if lines else ""
        
        # 构建带上下文的 content
        context_prefix = ""
        if breadcrumb:
            context_prefix = f"【{' > '.join(breadcrumb)}】\n\n"
        
        chunks.append({
            "document_id": document_id,
            "chunk_index": chunk_index,
            "page_number": page_number,
            "total_pages": total_pages,
            "breadcrumb": breadcrumb,
            "title": title,
            "content": context_prefix + full_chunk,
            "content_length": len(context_prefix + full_chunk),
            "source": f"{document_id}.pdf",
            "strategy": "qa_regex"
        })
        chunk_index += 1
        current_pos = chunk_start_pos + len(header) + len(content)
    
    return chunks


# ============================================================================
# 分析与保存
# ============================================================================

def analyze_chunks(chunks: List[Dict]) -> None:
    """分析切分结果"""
    if not chunks:
        return
    
    lengths = [c["content_length"] for c in chunks]
    avg_len = sum(lengths) / len(lengths)
    max_len = max(lengths)
    min_len = min(lengths)
    
    with_breadcrumb = sum(1 for c in chunks if c["breadcrumb"])
    
    print(f"\n📊 切分统计:")
    print(f"   Chunk 数: {len(chunks)}")
    print(f"   平均长度: {avg_len:.0f} 字符")
    print(f"   最长: {max_len}, 最短: {min_len}")
    print(f"   有面包屑: {with_breadcrumb}/{len(chunks)}")


def save_preview(chunks: List[Dict], output_path: str) -> None:
    """保存预览文件"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("# 语义流 v2 - Q&A 切分预览\n")
        f.write(f"Chunk 数: {len(chunks)}\n")
        f.write("=" * 60 + "\n\n")
        
        for c in chunks:
            f.write(f"--- Chunk {c['chunk_index']} (第 {c['page_number']} 页) ---\n")
            f.write(f"标题: {c['title']}\n")
            f.write(f"面包屑: {' > '.join(c['breadcrumb']) if c['breadcrumb'] else '(无)'}\n")
            f.write(f"长度: {c['content_length']} 字符\n\n")
            preview = c["content"][:400]
            f.write(preview)
            if len(c["content"]) > 400:
                f.write(f"\n... (省略 {len(c['content']) - 400} 字符)")
            f.write("\n\n")
    
    print(f"   💾 预览已保存: {output_path}")


def save_json(chunks: List[Dict], output_dir: str) -> None:
    """保存 JSON"""
    os.makedirs(output_dir, exist_ok=True)
    
    docs = {}
    for c in chunks:
        doc_id = c["document_id"]
        if doc_id not in docs:
            docs[doc_id] = []
        docs[doc_id].append(c)
    
    for doc_id, doc_chunks in docs.items():
        output_path = os.path.join(output_dir, f"{doc_id}.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(doc_chunks, f, ensure_ascii=False, indent=2)
        print(f"   💾 已保存: {output_path}")


# ============================================================================
# 入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="语义流 v2 - 全文提取 + Q&A 切分")
    parser.add_argument("--pdf", type=str, help="指定单个 PDF")
    parser.add_argument("--output", type=str, default=OUTPUT_DIR)
    parser.add_argument("--crop", type=float, default=DEFAULT_CROP_RATIO, help="裁切比例 (默认 0.08)")
    parser.add_argument("--dry-run", action="store_true", help="仅预览")
    
    args = parser.parse_args()
    
    if args.pdf:
        pdf_files = [args.pdf]
    else:
        pdf_files = list(Path(PDF_DIR).glob("*.pdf"))
    
    if not pdf_files:
        print(f"❌ 未找到 PDF")
        return
    
    print(f"🚀 语义流 v2 处理器")
    print(f"   裁切比例: {args.crop*100:.0f}%")
    
    all_chunks = []
    
    for pdf_path in pdf_files:
        document_id = Path(pdf_path).stem
        
        # 1. 提取每页文本
        pages_data, total_pages, toc_mapping = extract_pages_with_crop(
            str(pdf_path), 
            crop_ratio=args.crop
        )
        
        # 2. Q&A 切分
        chunks = split_by_qa_regex(pages_data, document_id, total_pages)
        all_chunks.extend(chunks)
    
    # 分析
    analyze_chunks(all_chunks)
    
    # 保存预览
    save_preview(all_chunks, PREVIEW_FILE)
    
    if args.dry_run:
        print(f"\n[DRY RUN] 未保存 JSON")
    else:
        save_json(all_chunks, args.output)
    
    print(f"\n✅ 完成! 共 {len(all_chunks)} 个 chunks")


if __name__ == "__main__":
    main()
