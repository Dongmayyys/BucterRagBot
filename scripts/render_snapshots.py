# -*- coding: utf-8 -*-
"""
视觉流处理脚本 - PDF 页面渲染为 WebP 图片
=========================================

功能：
1. 将 PDF 每一页渲染为高质量 WebP 图片
2. 可配置 DPI 和压缩质量
3. 按可预测命名规则输出: {document_id}/page_{n}.webp

使用方法:
    python render_snapshots.py                      # 渲染所有 PDF
    python render_snapshots.py --dpi 120            # 指定分辨率
    python render_snapshots.py --quality 80         # 指定压缩质量
    python render_snapshots.py --pdf data/xxx.pdf   # 指定单个文件
"""

import os
import argparse
from pathlib import Path
from typing import List, Tuple

import fitz  # PyMuPDF
from PIL import Image


# ============================================================================
# 配置
# ============================================================================

PDF_DIR = "data"
OUTPUT_DIR = "snapshots"

# 默认参数 (已优化)
DEFAULT_DPI = 144       # 2x 屏幕密度，清晰且体积小
DEFAULT_QUALITY = 75    # WebP 性价比拐点
DEFAULT_GRAYSCALE = True  # 默认灰度模式，节省 50% 空间


# ============================================================================
# 核心渲染逻辑
# ============================================================================

def render_pdf_pages(
    pdf_path: str,
    output_dir: str,
    dpi: int = DEFAULT_DPI,
    quality: int = DEFAULT_QUALITY,
    grayscale: bool = DEFAULT_GRAYSCALE
) -> List[dict]:
    """
    将 PDF 的每一页渲染为 WebP 图片
    
    Args:
        pdf_path: PDF 文件路径
        output_dir: 输出目录
        dpi: 渲染分辨率
        quality: WebP 压缩质量 (0-100)
        grayscale: 是否转换为灰度图 (减少 50% 体积)
    
    Returns:
        List[dict] 包含路径、尺寸、aspect_ratio 等信息
    """
    doc = fitz.open(pdf_path)
    document_id = Path(pdf_path).stem
    total_pages = len(doc)
    
    # 创建输出目录: {output_dir}/{document_id}/
    doc_output_dir = os.path.join(output_dir, document_id)
    os.makedirs(doc_output_dir, exist_ok=True)
    
    results = []
    
    print(f"\n📄 处理: {pdf_path}")
    print(f"   共 {total_pages} 页, DPI={dpi}, Quality={quality}, 灰度={'是' if grayscale else '否'}")
    
    for page_num in range(total_pages):
        page = doc[page_num]
        
        # 渲染为 pixmap
        pix = page.get_pixmap(dpi=dpi)
        
        # 转换为 PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        # 灰度模式转换
        if grayscale:
            img = img.convert("L")
        
        # 输出路径: page_1.webp, page_2.webp, ...
        output_path = os.path.join(doc_output_dir, f"page_{page_num + 1}.webp")
        
        # 保存为 WebP (method=6 是最慢但压缩率最高的模式)
        img.save(output_path, "WEBP", quality=quality, method=6)
        
        # 获取文件大小
        file_size = os.path.getsize(output_path)
        
        # 记录结果 (包含前端需要的 aspect_ratio)
        results.append({
            "path": output_path,
            "page_number": page_num + 1,
            "width": pix.width,
            "height": pix.height,
            "aspect_ratio": round(pix.width / pix.height, 4),
            "file_size": file_size
        })
        
        # 进度指示
        print(f"   ✓ 第 {page_num + 1}/{total_pages} 页 → {file_size / 1024:.1f} KB")
    
    doc.close()
    return results


def analyze_results(results: List[dict]) -> None:
    """分析渲染结果，检查是否满足 <200KB 目标"""
    if not results:
        return
    
    sizes = [r["file_size"] for r in results]
    avg_size = sum(sizes) / len(sizes) / 1024
    max_size = max(sizes) / 1024
    min_size = min(sizes) / 1024
    total_size = sum(sizes) / 1024 / 1024  # MB
    
    print(f"\n📊 统计:")
    print(f"   总大小: {total_size:.2f} MB")
    print(f"   平均大小: {avg_size:.1f} KB")
    print(f"   最大: {max_size:.1f} KB, 最小: {min_size:.1f} KB")
    
    # 输出 aspect_ratio 信息 (用于前端)
    if results:
        sample = results[0]
        print(f"   尺寸: {sample['width']}x{sample['height']}, 宽高比: {sample['aspect_ratio']}")
    
    over_limit = [r for r in results if r["file_size"] > 200 * 1024]
    if over_limit:
        print(f"\n⚠️  有 {len(over_limit)} 页超过 200KB 限制:")
        for r in over_limit[:5]:
            print(f"   - {r['path']}: {r['file_size'] / 1024:.1f} KB")
    else:
        print(f"   ✅ 所有页面均 < 200KB")


# ============================================================================
# 入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="PDF 页面渲染为 WebP 图片")
    parser.add_argument("--pdf", type=str, help="指定单个 PDF 文件 (默认处理 data/ 目录下所有)")
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help=f"渲染分辨率 (默认 {DEFAULT_DPI})")
    parser.add_argument("--quality", type=int, default=DEFAULT_QUALITY, help=f"WebP 压缩质量 0-100 (默认 {DEFAULT_QUALITY})")
    parser.add_argument("--output", type=str, default=OUTPUT_DIR, help=f"输出目录 (默认 {OUTPUT_DIR})")
    parser.add_argument("--no-grayscale", action="store_true", help="禁用灰度模式，保留彩色")
    
    args = parser.parse_args()
    grayscale = not args.no_grayscale  # 默认开启灰度
    
    # 确定要处理的 PDF 列表
    if args.pdf:
        pdf_files = [args.pdf]
    else:
        pdf_files = list(Path(PDF_DIR).glob("*.pdf"))
    
    if not pdf_files:
        print(f"❌ 未找到 PDF 文件 (目录: {PDF_DIR})")
        return
    
    print(f"🚀 视觉流处理器")
    print(f"   PDF 目录: {PDF_DIR}")
    print(f"   输出目录: {args.output}")
    print(f"   DPI: {args.dpi}, Quality: {args.quality}, 灰度: {'是' if grayscale else '否'}")
    
    all_results = []
    
    for pdf_path in pdf_files:
        results = render_pdf_pages(
            str(pdf_path),
            args.output,
            dpi=args.dpi,
            quality=args.quality,
            grayscale=grayscale
        )
        all_results.extend(results)
    
    # 总体分析
    analyze_results(all_results)
    print(f"\n✅ 完成! 共渲染 {len(all_results)} 页")


if __name__ == "__main__":
    main()
