# -*- coding: utf-8 -*-
"""
数据预处理脚本 (三重兜底分块策略)
================================

分块流水线:
1. Layer 1: 正则规则切分 (精度最高) - Q&A 格式 / 标题格式
2. Layer 2: 语义切分 (自适应) - 基于 Embedding 相似度断点
3. Layer 3: 固定窗口切分 (兜底) - RecursiveCharacterTextSplitter

使用方法:
    python ingest.py --strategy auto --dry-run    # 预览
    python ingest.py --strategy auto --upload     # 上传

策略选项:
    --strategy auto      自动检测并选择最佳策略 (推荐)
    --strategy qa        强制使用 Q&A 正则切分
    --strategy title     强制使用标题层级切分
    --strategy semantic  强制使用语义切分
    --strategy baseline  强制使用固定窗口切分
"""

import os
import re
import glob
import argparse
import numpy as np
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from abc import ABC, abstractmethod

import fitz  # PyMuPDF - 用于提取页码和大纲
import pymupdf4llm
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from supabase import create_client

load_dotenv()

# ============================================================================
# 配置
# ============================================================================

PDF_DIR = "data"
PREVIEW_FILE = "docs/preview_chunks.txt"
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY")

# 语义切分参数
目标块大小 = 180      # 期望每个 Chunk 约 180 字符 (与 qa_regex 对齐)
最小块长度 = 80       # 块长度低于此值会合并

# 裁切参数
DEFAULT_CROP_RATIO = 0.10  # 裁切顶部/底部各 10% 去除页眉页脚


# ============================================================================
# 页码与面包屑工具函数
# ============================================================================

def extract_toc_mapping(doc: fitz.Document) -> Dict[int, List[str]]:
    """
    从 PDF 大纲 (TOC) 构建页码到面包屑的映射
    
    Returns:
        {page_number: ["章节", "小节", ...]}
    """
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


def get_breadcrumb_for_page(
    page_num: int, 
    toc_mapping: Dict[int, List[str]],
    doc_display_name: str
) -> str:
    """
    获取指定页面的完整面包屑字符串
    
    格式: 【文档名 > 章节 > 小节】
    """
    if not toc_mapping:
        return f"【{doc_display_name}】"
    
    valid_pages = [p for p in toc_mapping.keys() if p <= page_num]
    if not valid_pages:
        return f"【{doc_display_name}】"
    
    closest_page = max(valid_pages)
    breadcrumb_parts = toc_mapping[closest_page]
    
    return f"【{doc_display_name} > {' > '.join(breadcrumb_parts)}】"


def extract_pages_with_metadata(
    pdf_path: str,
    crop_ratio: float = DEFAULT_CROP_RATIO
) -> Tuple[List[Dict], int, Dict[int, List[str]], str]:
    """
    从 PDF 提取每页文本，同时获取大纲信息
    
    Args:
        pdf_path: PDF 文件路径
        crop_ratio: 裁切比例 (上下各裁切)
    
    Returns:
        (pages_data, total_pages, toc_mapping, display_name)
    """
    doc = fitz.open(pdf_path)
    document_id = Path(pdf_path).stem
    total_pages = len(doc)
    
    # 解析大纲
    toc_mapping = extract_toc_mapping(doc)
    
    # 生成显示名 (去掉年份前缀等)
    display_name = document_id.replace('-', ' ').strip()
    
    pages_data = []
    
    for page_num in range(total_pages):
        page = doc[page_num]
        page_number = page_num + 1  # 1-indexed
        
        # CropBox 裁切
        page_rect = page.rect
        margin = page_rect.height * crop_ratio
        clip = fitz.Rect(0, margin, page_rect.width, page_rect.height - margin)
        text = page.get_text("text", clip=clip).strip()
        
        pages_data.append({
            "page_number": page_number,
            "text": text,
            "text_length": len(text)
        })
    
    doc.close()
    
    return pages_data, total_pages, toc_mapping, display_name


def build_position_to_page_map(pages_data: List[Dict]) -> Tuple[str, List[int]]:
    """
    合并全文并建立字符位置到页码的映射
    
    Returns:
        (full_text, position_to_page)
        position_to_page[i] = 第 i 个字符所在的页码
    """
    full_text = ""
    position_to_page = []
    
    for page in pages_data:
        start_pos = len(full_text)
        full_text += page["text"] + "\n\n"
        end_pos = len(full_text)
        
        for _ in range(start_pos, end_pos):
            position_to_page.append(page["page_number"])
    
    return full_text, position_to_page


def get_page_for_position(position: int, position_to_page: List[int]) -> int:
    """根据字符位置获取页码"""
    if not position_to_page:
        return 1
    if position < 0:
        return position_to_page[0] if position_to_page else 1
    if position >= len(position_to_page):
        return position_to_page[-1] if position_to_page else 1
    return position_to_page[position]


# ============================================================================
# PDF 上下文 (传递给策略类的元数据)
# ============================================================================

class PDFContext:
    """PDF 文档上下文，携带页码和面包屑信息"""
    
    def __init__(
        self,
        filename: str,
        document_id: str,
        display_name: str,
        total_pages: int,
        full_text: str,
        position_to_page: List[int],
        toc_mapping: Dict[int, List[str]]
    ):
        self.filename = filename
        self.document_id = document_id
        self.display_name = display_name
        self.total_pages = total_pages
        self.full_text = full_text
        self.position_to_page = position_to_page
        self.toc_mapping = toc_mapping
    
    def get_page_for_position(self, position: int) -> int:
        """根据字符位置获取页码"""
        return get_page_for_position(position, self.position_to_page)
    
    def get_breadcrumb(self, page_num: int) -> str:
        """获取页面的面包屑"""
        return get_breadcrumb_for_page(page_num, self.toc_mapping, self.display_name)


# ============================================================================
# 分块策略基类
# ============================================================================

class ChunkStrategy(ABC):
    """分块策略基类"""
    
    name: str = "base"
    
    @abstractmethod
    def detect(self, text: str) -> bool:
        """检测文档是否适用此策略"""
        pass
    
    @abstractmethod
    def split(self, text: str, filename: str, ctx: Optional['PDFContext'] = None) -> List[Document]:
        """
        执行分块
        
        Args:
            text: 全文内容
            filename: 文件名
            ctx: PDF 上下文 (含页码、面包屑等)
        """
        pass


# ============================================================================
# Layer 1: 正则规则切分策略
# ============================================================================

class QARegexStrategy(ChunkStrategy):
    """
    Q&A 问答式文档切分策略
    
    适用于: 
    - 格式为 "1. 什么是...？" 的问答文档
    - 格式为 "**1. 问题标题**" 的 Markdown 文档
    """
    
    name = "qa_regex"
    # 匹配: 换行 + 数字 + . + 空格 + 中文(问题开头)
    # 排除: 小数(如1.5)、编号列表(如1.1)
    pattern = r'(\n\d+\.\s+(?=[\u4e00-\u9fa5]))'
    
    def detect(self, text: str) -> bool:
        """检测是否包含 Q&A 格式标记"""
        # 匹配问题格式: 数字. + 中文问句词（什么/如何/怎样/哪些/可以/是否）
        matches = re.findall(r'\n\d+\.\s+(什么|如何|怎样|怎么|哪些|可以|是否|为什么|能否|需要)', text)
        return len(matches) >= 5  # 至少有 5 个问题才认为是 Q&A 格式
    
    def split(self, text: str, filename: str, ctx: Optional[PDFContext] = None) -> List[Document]:
        """按 Q&A 边界切分，附加页码和面包屑"""
        parts = re.split(self.pattern, text)
        chunks = []
        chunk_index = 0
        current_pos = 0
        
        # 从文件名提取 document_id
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        # 前言/目录部分
        if parts[0].strip():
            intro_text = parts[0].strip()
            page_num = ctx.get_page_for_position(0) if ctx else 1
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n【前言/目录】\n{intro_text}",
                metadata={
                    "source": filename, 
                    "type": "intro", 
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            ))
            chunk_index += 1
            current_pos = len(parts[0])
        
        # 问答对
        for i in range(1, len(parts), 2):
            header = parts[i]
            content = parts[i+1] if i+1 < len(parts) else ""
            full_chunk = header.strip() + content.strip()
            
            # 计算页码
            chunk_start_pos = text.find(header, current_pos)
            if ctx and chunk_start_pos >= 0:
                page_num = ctx.get_page_for_position(chunk_start_pos)
                breadcrumb = ctx.get_breadcrumb(page_num)
            else:
                page_num = 1
                breadcrumb = f"【{document_id}】"
            
            # 提取问题标题
            lines = full_chunk.split('\n')
            title = lines[0].replace('**', '').strip()
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n{full_chunk}",
                metadata={
                    "source": filename,
                    "title": title,
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            ))
            chunk_index += 1
            current_pos = chunk_start_pos + len(header) + len(content)
        
        return chunks


class TitleHierarchyStrategy(ChunkStrategy):
    """
    标题层级式文档切分策略
    
    适用于: 格式为 "第一章 / 第一条 / 第一节" 的文档
    """
    
    name = "title_hierarchy"
    patterns = [
        r'(第[一二三四五六七八九十百零]+章)',   # 章
        r'(第[一二三四五六七八九十百零]+条)',   # 条
        r'(第[一二三四五六七八九十百零]+节)',   # 节
    ]
    
    def detect(self, text: str) -> bool:
        """检测是否包含标题层级格式"""
        for pattern in self.patterns:
            matches = re.findall(pattern, text)
            if len(matches) >= 3:
                return True
        return False
    
    def split(self, text: str, filename: str, ctx: Optional[PDFContext] = None) -> List[Document]:
        """按标题层级切分 (优先按条切分)，附加页码和面包屑"""
        pattern = r'(第[一二三四五六七八九十百零]+条)'
        parts = re.split(pattern, text)
        chunks = []
        chunk_index = 0
        current_pos = 0
        
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        # 前言部分
        if parts[0].strip() and len(parts[0].strip()) > 50:
            page_num = ctx.get_page_for_position(0) if ctx else 1
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n{parts[0].strip()}",
                metadata={
                    "source": filename,
                    "type": "intro",
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": chunk_index,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            ))
            chunk_index += 1
            current_pos = len(parts[0])
        
        # 按条组合
        for i in range(1, len(parts), 2):
            header = parts[i]
            content = parts[i+1] if i+1 < len(parts) else ""
            full_chunk = header + content.strip()
            
            if len(full_chunk.strip()) > 20:
                chunk_start_pos = text.find(header, current_pos)
                if ctx and chunk_start_pos >= 0:
                    page_num = ctx.get_page_for_position(chunk_start_pos)
                    breadcrumb = ctx.get_breadcrumb(page_num)
                else:
                    page_num = 1
                    breadcrumb = f"【{document_id}】"
                
                chunks.append(Document(
                    page_content=f"{breadcrumb}\n\n{full_chunk.strip()}",
                    metadata={
                        "source": filename,
                        "title": header,
                        "strategy": self.name,
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "page_number": page_num,
                        "total_pages": total_pages,
                        "breadcrumb": breadcrumb
                    }
                ))
                chunk_index += 1
                current_pos = chunk_start_pos + len(header) + len(content)
        
        return chunks


# ============================================================================
# Layer 2: 语义切分策略
# ============================================================================

class SemanticChunkStrategy(ChunkStrategy):
    """
    语义切分策略 (自动百分位)
    
    算法:
    1. 按双换行切分成段落
    2. 计算相邻段落的 Embedding 余弦相似度
    3. 取相似度最低的 N% 作为断点 (自适应阈值)
    4. 合并过小的块
    """
    
    name = "semantic"
    
    def __init__(self, embeddings: Optional[OpenAIEmbeddings] = None):
        self.embeddings = embeddings
    
    def detect(self, text: str) -> bool:
        """语义切分总是可用的 (作为兜底)"""
        return True
    
    def _分段落(self, text: str) -> List[str]:
        """按双换行切分成段落"""
        段落列表 = re.split(r'\n\s*\n', text)
        return [p.strip() for p in 段落列表 if p.strip() and len(p.strip()) > 10]
    
    def _自动计算百分位(self, 段落列表: List[str]) -> float:
        """
        根据目标块大小自动计算百分位
        
        公式:
        - 文档总长度 = sum(len(段落) for 段落 in 段落列表)
        - 期望块数 = 文档总长度 // 目标块大小
        - 百分位 = (期望块数 - 1) / 段落数 * 100
        """
        文档总长度 = sum(len(段落) for 段落 in 段落列表)
        期望块数 = max(1, 文档总长度 // 目标块大小)
        期望断点数 = 期望块数 - 1
        
        if len(段落列表) <= 1:
            return 10.0
        
        百分位 = (期望断点数 / len(段落列表)) * 100
        return max(1, min(30, 百分位))
    
    def _计算余弦相似度(self, 向量A: List[float], 向量B: List[float]) -> float:
        """计算两个向量的余弦相似度"""
        A = np.array(向量A)
        B = np.array(向量B)
        点积 = np.dot(A, B)
        模长乘积 = np.linalg.norm(A) * np.linalg.norm(B)
        
        if 模长乘积 == 0:
            return 0.0
        return float(点积 / 模长乘积)
    
    def _合并小块(self, 块列表: List[str]) -> List[str]:
        """将过小的块与相邻块合并"""
        if not 块列表:
            return 块列表
        
        合并后列表 = []
        当前块 = 块列表[0]
        
        for i in range(1, len(块列表)):
            下一块 = 块列表[i]
            if len(当前块) < 最小块长度:
                当前块 = 当前块 + "\n\n" + 下一块
            else:
                合并后列表.append(当前块)
                当前块 = 下一块
        
        if 当前块:
            合并后列表.append(当前块)
        
        return 合并后列表
    
    def split(self, text: str, filename: str, ctx: Optional[PDFContext] = None) -> List[Document]:
        """执行语义切分 (暂不支持页码映射)"""
        if self.embeddings is None:
            raise ValueError("语义切分需要提供 embeddings 模型")
        
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        段落列表 = self._分段落(text)
        
        if len(段落列表) <= 1:
            breadcrumb = ctx.get_breadcrumb(1) if ctx else f"【{document_id}】"
            return [Document(
                page_content=f"{breadcrumb}\n\n{text}",
                metadata={
                    "source": filename, 
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": 0,
                    "page_number": 1,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            )]
        
        # 批量计算 Embedding
        print(f"   [语义切分] 计算 {len(段落列表)} 个段落的 Embedding...")
        批大小 = 30
        段落向量列表 = []
        
        for i in range(0, len(段落列表), 批大小):
            批次 = 段落列表[i : i + 批大小]
            批次向量 = self.embeddings.embed_documents(批次)
            段落向量列表.extend(批次向量)
        
        # 计算相邻段落相似度
        相似度列表 = []
        for i in range(len(段落向量列表) - 1):
            相似度 = self._计算余弦相似度(段落向量列表[i], 段落向量列表[i + 1])
            相似度列表.append(相似度)
        
        # 自动百分位确定阈值
        百分位 = self._自动计算百分位(段落列表)
        自适应阈值 = np.percentile(相似度列表, 百分位)
        print(f"   [语义切分] 自动百分位: {百分位:.1f}%, 阈值: {自适应阈值:.4f}")
        
        # 找断点
        断点索引列表 = [i + 1 for i, sim in enumerate(相似度列表) if sim < 自适应阈值]
        
        # 按断点切分
        原始块列表 = []
        上一个断点 = 0
        
        for 断点 in 断点索引列表:
            块段落 = 段落列表[上一个断点:断点]
            块文本 = "\n\n".join(块段落)
            if 块文本:
                原始块列表.append(块文本)
            上一个断点 = 断点
        
        if 上一个断点 < len(段落列表):
            块段落 = 段落列表[上一个断点:]
            块文本 = "\n\n".join(块段落)
            if 块文本:
                原始块列表.append(块文本)
        
        # 合并小块
        最终块列表 = self._合并小块(原始块列表)
        
        # 转换为 Document
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        chunks = []
        for i, 块 in enumerate(最终块列表):
            # 语义切分暂时使用第一页作为默认页码
            page_num = 1
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n{块}",
                metadata={
                    "source": filename,
                    "chunk_index": i,
                    "strategy": self.name,
                    "document_id": document_id,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            ))
        
        print(f"   [语义切分] 生成 {len(chunks)} 个块")
        return chunks


# ============================================================================
# Layer 3: 固定窗口切分策略 (兜底)
# ============================================================================

class BaselineStrategy(ChunkStrategy):
    """
    固定窗口切分策略 (兜底)
    
    使用 RecursiveCharacterTextSplitter 按固定大小切分
    """
    
    name = "baseline"
    
    def __init__(self, chunk_size: int = 180, chunk_overlap: int = 30):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", "。", "；", " ", ""]  # 按优先级递归切分
        )
    
    def detect(self, text: str) -> bool:
        """固定切分总是可用"""
        return True
    
    def split(self, text: str, filename: str, ctx: Optional[PDFContext] = None) -> List[Document]:
        """执行固定窗口切分 (暂不支持页码映射)"""
        texts = self.splitter.split_text(text)
        chunks = []
        
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        for i, t in enumerate(texts):
            page_num = 1
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n{t}",
                metadata={
                    "source": filename,
                    "chunk_index": i,
                    "strategy": self.name,
                    "document_id": document_id,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            ))
        
        return chunks


# ============================================================================
# 自动检测与三重兜底
# ============================================================================

def auto_detect_and_chunk(
    text: str, 
    filename: str, 
    ctx: Optional[PDFContext] = None,
    embeddings: Optional[OpenAIEmbeddings] = None
) -> Tuple[List[Document], str]:
    """
    自动检测文档类型并选择最佳分块策略 (三重兜底)
    
    优先级:
    1. Q&A 正则 (检测到 **数字. 格式)
    2. 标题层级 (检测到 第X章/条 格式)
    3. 语义切分 (需要 embeddings)
    4. 固定窗口 (最终兜底)
    
    返回:
        (文档块列表, 使用的策略名称)
    """
    # Layer 1: 尝试 Q&A 正则
    qa_strategy = QARegexStrategy()
    if qa_strategy.detect(text):
        print(f"   检测到 Q&A 格式，使用正则切分")
        return qa_strategy.split(text, filename, ctx), qa_strategy.name
    
    # Layer 1: 尝试标题层级
    title_strategy = TitleHierarchyStrategy()
    if title_strategy.detect(text):
        print(f"   检测到标题层级格式，使用标题切分")
        return title_strategy.split(text, filename, ctx), title_strategy.name
    
    # Layer 2: 语义切分 (如果有 embeddings)
    if embeddings is not None:
        print(f"   未检测到结构化格式，使用语义切分")
        semantic_strategy = SemanticChunkStrategy(embeddings)
        return semantic_strategy.split(text, filename, ctx), semantic_strategy.name
    
    # Layer 3: 固定窗口兜底
    print(f"   使用固定窗口切分 (兜底)")
    baseline_strategy = BaselineStrategy()
    return baseline_strategy.split(text, filename, ctx), baseline_strategy.name


# ============================================================================
# 文本清洗
# ============================================================================

def clean_markdown(text: str) -> str:
    """清洗 PDF 转换后的 Markdown 文本"""
    # 移除页码 (如 ~ 1 ~)
    text = re.sub(r'\n\s*~\s*\d+\s*~\s*\n', '\n', text)
    # 移除目录点线
    text = re.sub(r'\.{5,}', '', text)
    # 移除过多空行
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


# ============================================================================
# 主流程
# ============================================================================

def process_and_upload(strategy: str = "auto", dry_run: bool = True):
    """
    处理 PDF 文件并上传到向量数据库
    
    参数:
        strategy: 分块策略 (auto/qa/title/semantic/baseline)
        dry_run: 是否只预览不上传
    """
    embeddings = None
    supabase = None
    
    if not dry_run or strategy in ["auto", "semantic"]:
        embeddings = OpenAIEmbeddings(
            base_url="https://api.siliconflow.cn/v1",
            api_key=SILICONFLOW_API_KEY,
            model="BAAI/bge-m3",
            check_embedding_ctx_length=False
        )
    
    if not dry_run:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # 注意：数据通过 metadata.strategy 字段隔离，不需要手动清理
        # 相同 strategy 的数据会共存，评估时通过 filter 区分
        print(f"连接 Supabase...")
    
    pdf_files = glob.glob(os.path.join(PDF_DIR, "*.pdf"))
    all_docs = []
    strategy_used = {}
    
    for pdf_path in pdf_files:
        print(f"\n处理: {pdf_path}")
        filename = os.path.basename(pdf_path)
        document_id = Path(pdf_path).stem
        
        # 使用 CropBox 提取每页文本并建立页码映射
        pages_data, total_pages, toc_mapping, display_name = extract_pages_with_metadata(pdf_path)
        full_text, position_to_page = build_position_to_page_map(pages_data)
        
        # 清洗文本
        clean_text = clean_markdown(full_text)
        
        # 创建 PDF 上下文
        ctx = PDFContext(
            filename=filename,
            document_id=document_id,
            display_name=display_name,
            total_pages=total_pages,
            full_text=clean_text,
            position_to_page=position_to_page,
            toc_mapping=toc_mapping
        )
        
        print(f"   总页数: {total_pages}, 大纲章节: {len(toc_mapping)}")
        
        # 根据策略选择切分方法
        if strategy == "auto":
            docs, used_strategy = auto_detect_and_chunk(clean_text, filename, ctx, embeddings)
        elif strategy == "qa":
            docs = QARegexStrategy().split(clean_text, filename, ctx)
            used_strategy = "qa_regex"
        elif strategy == "title":
            docs = TitleHierarchyStrategy().split(clean_text, filename, ctx)
            used_strategy = "title_hierarchy"
        elif strategy == "semantic":
            docs = SemanticChunkStrategy(embeddings).split(clean_text, filename, ctx)
            used_strategy = "semantic"
        elif strategy == "baseline":
            docs = BaselineStrategy().split(clean_text, filename, ctx)
            used_strategy = "baseline"
        else:
            raise ValueError(f"未知策略: {strategy}")
        
        strategy_used[filename] = used_strategy
        print(f" -> 使用策略: {used_strategy}, 生成 {len(docs)} 个块")
        all_docs.extend(docs)
    
    # 保存预览
    os.makedirs(os.path.dirname(PREVIEW_FILE), exist_ok=True)
    with open(PREVIEW_FILE, "w", encoding="utf-8") as f:
        f.write(f"# 分块预览\n")
        f.write(f"策略: {strategy}\n")
        f.write(f"总块数: {len(all_docs)}\n")
        f.write(f"{'=' * 60}\n\n")
        
        for i, doc in enumerate(all_docs):
            title = doc.metadata.get('title', f'Chunk {i+1}')
            f.write(f"--- [{doc.metadata.get('strategy')}] {title} ({len(doc.page_content)} 字符) ---\n")
            f.write(doc.page_content[:500])  # 只预览前 500 字符
            if len(doc.page_content) > 500:
                f.write(f"\n... (省略 {len(doc.page_content) - 500} 字符)")
            f.write(f"\n\n")
    
    print(f"\n预览已保存: {PREVIEW_FILE}")
    
    if dry_run:
        print(f"\n[DRY RUN] 共 {len(all_docs)} 块准备就绪，未上传")
        print(f"使用 --upload 参数执行实际上传")
    else:
        # 批量上传
        print(f"\n上传 {len(all_docs)} 块到 Supabase...")
        batch_size = 50
        for i in range(0, len(all_docs), batch_size):
            batch = all_docs[i : i + batch_size]
            print(f"  上传第 {i // batch_size + 1} 批 ({len(batch)} 块)...")
            SupabaseVectorStore.from_documents(
                documents=batch,
                embedding=embeddings,
                client=supabase,
                table_name="documents",
                query_name="match_documents"
            )
        print("上传完成!")


# ============================================================================
# 入口
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RAG 数据预处理脚本 (三重兜底分块)")
    parser.add_argument(
        "--strategy", 
        choices=["auto", "qa", "title", "semantic", "baseline"],
        default="auto",
        help="分块策略: auto(自动检测), qa(Q&A正则), title(标题层级), semantic(语义), baseline(固定窗口)"
    )
    parser.add_argument("--upload", action="store_true", help="实际上传到数据库")
    
    args = parser.parse_args()
    
    process_and_upload(strategy=args.strategy, dry_run=not args.upload)
