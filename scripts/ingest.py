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
from typing import List, Tuple, Optional
from abc import ABC, abstractmethod

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
    def split(self, text: str, filename: str) -> List[Document]:
        """执行分块"""
        pass


# ============================================================================
# Layer 1: 正则规则切分策略
# ============================================================================

class QARegexStrategy(ChunkStrategy):
    """
    Q&A 问答式文档切分策略
    
    适用于: 格式为 "**1. 问题标题**" 的文档
    """
    
    name = "qa_regex"
    pattern = r'(\n\*\*\d+\.\s+)'
    
    def detect(self, text: str) -> bool:
        """检测是否包含 Q&A 格式标记"""
        matches = re.findall(r'\*\*\d+\.', text)
        return len(matches) >= 5  # 至少有 5 个问题才认为是 Q&A 格式
    
    def split(self, text: str, filename: str) -> List[Document]:
        """按 Q&A 边界切分"""
        parts = re.split(self.pattern, text)
        chunks = []
        chunk_index = 0
        
        # 从文件名提取 document_id（去掉 .pdf 后缀）
        document_id = filename.replace('.pdf', '')
        
        # 前言/目录部分
        if parts[0].strip():
            chunks.append(Document(
                page_content="【前言/目录】\n" + parts[0].strip(),
                metadata={
                    "source": filename, 
                    "type": "intro", 
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": chunk_index
                }
            ))
            chunk_index += 1
        
        # 问答对
        for i in range(1, len(parts), 2):
            header = parts[i]
            content = parts[i+1] if i+1 < len(parts) else ""
            full_text = header.strip() + content.strip()
            
            # 提取问题标题
            lines = full_text.split('\n')
            title = lines[0].replace('**', '').strip()
            
            chunks.append(Document(
                page_content=full_text,
                metadata={
                    "source": filename,
                    "title": title,
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": chunk_index
                }
            ))
            chunk_index += 1
        
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
    
    def split(self, text: str, filename: str) -> List[Document]:
        """按标题层级切分 (优先按条切分)"""
        # 优先按"条"切分，因为每条通常是一个独立的规定
        pattern = r'(第[一二三四五六七八九十百零]+条)'
        parts = re.split(pattern, text)
        chunks = []
        
        # 前言部分
        if parts[0].strip() and len(parts[0].strip()) > 50:
            chunks.append(Document(
                page_content=parts[0].strip(),
                metadata={
                    "source": filename,
                    "type": "intro",
                    "strategy": self.name
                }
            ))
        
        # 按条组合
        for i in range(1, len(parts), 2):
            header = parts[i]
            content = parts[i+1] if i+1 < len(parts) else ""
            full_text = header + content.strip()
            
            if len(full_text.strip()) > 20:
                chunks.append(Document(
                    page_content=full_text.strip(),
                    metadata={
                        "source": filename,
                        "title": header,
                        "strategy": self.name
                    }
                ))
        
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
    
    def split(self, text: str, filename: str) -> List[Document]:
        """执行语义切分"""
        if self.embeddings is None:
            raise ValueError("语义切分需要提供 embeddings 模型")
        
        段落列表 = self._分段落(text)
        
        if len(段落列表) <= 1:
            return [Document(
                page_content=text,
                metadata={"source": filename, "strategy": self.name}
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
        chunks = []
        for i, 块 in enumerate(最终块列表):
            chunks.append(Document(
                page_content=块,
                metadata={
                    "source": filename,
                    "chunk_index": i,
                    "strategy": self.name
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
    
    def split(self, text: str, filename: str) -> List[Document]:
        """执行固定窗口切分"""
        texts = self.splitter.split_text(text)
        chunks = []
        
        for i, t in enumerate(texts):
            chunks.append(Document(
                page_content=t,
                metadata={
                    "source": filename,
                    "chunk_index": i,
                    "strategy": self.name
                }
            ))
        
        return chunks


# ============================================================================
# 自动检测与三重兜底
# ============================================================================

def auto_detect_and_chunk(
    text: str, 
    filename: str, 
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
        return qa_strategy.split(text, filename), qa_strategy.name
    
    # Layer 1: 尝试标题层级
    title_strategy = TitleHierarchyStrategy()
    if title_strategy.detect(text):
        print(f"   检测到标题层级格式，使用标题切分")
        return title_strategy.split(text, filename), title_strategy.name
    
    # Layer 2: 语义切分 (如果有 embeddings)
    if embeddings is not None:
        print(f"   未检测到结构化格式，使用语义切分")
        semantic_strategy = SemanticChunkStrategy(embeddings)
        return semantic_strategy.split(text, filename), semantic_strategy.name
    
    # Layer 3: 固定窗口兜底
    print(f"   使用固定窗口切分 (兜底)")
    baseline_strategy = BaselineStrategy()
    return baseline_strategy.split(text, filename), baseline_strategy.name


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
        raw_md = pymupdf4llm.to_markdown(pdf_path)
        clean_md = clean_markdown(raw_md)
        
        filename = os.path.basename(pdf_path)
        
        # 根据策略选择切分方法
        if strategy == "auto":
            docs, used_strategy = auto_detect_and_chunk(clean_md, filename, embeddings)
        elif strategy == "qa":
            docs = QARegexStrategy().split(clean_md, filename)
            used_strategy = "qa_regex"
        elif strategy == "title":
            docs = TitleHierarchyStrategy().split(clean_md, filename)
            used_strategy = "title_hierarchy"
        elif strategy == "semantic":
            docs = SemanticChunkStrategy(embeddings).split(clean_md, filename)
            used_strategy = "semantic"
        elif strategy == "baseline":
            docs = BaselineStrategy().split(clean_md, filename)
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
