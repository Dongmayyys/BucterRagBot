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

# 裁切参数（针对不同文档可配置不同值）
DEFAULT_CROP_RATIO = 0.10  # 默认裁切顶部/底部各 10%

# 文档特定的裁切比例
DOCUMENT_CROP_RATIO = {
    "2025-本科生手册": 0.13,  # 手册页眉页脚较大，需要 13%
    # 学习指南使用默认 10%
}

# ============================================================================
# 手动 TOC 映射表（用于 PDF 大纲不完整的文档）
# 格式：{document_id: {"offset": 偏移量, "toc": {page_number: [章节层级列表]}}}
# 注意：page_number 是目录标注的逻辑页码，offset 用于转换到物理页码
# ============================================================================

# 页码偏移量：物理页码 = 逻辑页码 + offset
MANUAL_TOC_OFFSET = {
    "2025-本科生手册": 8,  # 目录标注 P3 对应物理页 11
}

MANUAL_TOC_MAPPING = {
    "2025-本科生手册": {
        # 法律法规规章 (P3-P14)
        3: ["法律法规规章", "普通高等学校学生管理规定（教育部41号令）"],
        14: ["法律法规规章", "高等学校学生行为准则"],

        # 教育教学管理制度 (P17-P100)
        17: ["教育教学管理制度", "北京化工大学本科生学籍管理规定"],
        29: ["教育教学管理制度", "北京化工大学课堂教学管理规定"],
        30: ["教育教学管理制度", "北京化工大学本科生课程考核管理规定"],
        37: ["教育教学管理制度", "北京化工大学考场规则"],
        38: ["教育教学管理制度", "北京化工大学本科生课程成绩评定与管理办法"],
        43: ["教育教学管理制度", "课程总评成绩记分方式及绩点对应关系表"],
        44: ["教育教学管理制度", "北京化工大学本科生创新创业教育学分认定管理办法（试行）"],
        51: ["教育教学管理制度", "北京化工大学《国家学生体质健康标准》实施办法（修订）"],
        59: ["教育教学管理制度", "北京化工大学'奔跑在北化'课外体育锻炼身体素质提升项目活动规则"],
        61: ["教育教学管理制度", "北京化工大学本科生转专业实施细则"],
        68: ["教育教学管理制度", "北京化工大学本科生学位论文学术道德和学术规范建设实施办法（试行）"],
        71: ["教育教学管理制度", "北京化工大学本科生毕业环节工作规定"],
        80: ["教育教学管理制度", "北京化工大学推荐优秀应届本科毕业生免试攻读研究生管理规定"],
        84: ["教育教学管理制度", "北京化工大学学位授予实施细则"],
        86: ["教育教学管理制度", "北京化工大学本科生辅修学士学位管理办法"],
        89: ["教育教学管理制度", "北京化工大学关于实施本科生导师制的指导意见"],
        90: ["教育教学管理制度", "北京化工大学大学生科研训练计划实施细则"],
        93: ["教育教学管理制度", "北京化工大学实验室守则"],
        94: ["教育教学管理制度", "北京化工大学学生下厂实习规则"],
        95: ["教育教学管理制度", "北京化工大学教室管理规定"],
        97: ["教育教学管理制度", "'北化在线'教育综合平台简介及使用说明"],
        99: ["教育教学管理制度", "北京化工大学智慧教学系统简介及使用注意事项"],
        100: ["教育教学管理制度", "北京化工大学实验室仪器设备损坏赔偿规定"],

        # 学生事务管理制度 (P103-P176)
        103: ["学生事务管理制度", "北京化工大学学生纪律处分规定"],
        120: ["学生事务管理制度", "北京化工大学本科生第二课堂成绩评定实施办法（试行）"],
        126: ["学生事务管理制度", "北京化工大学国家奖学金评审实施细则"],
        128: ["学生事务管理制度", "北京化工大学国家励志奖学金评审实施细则"],
        130: ["学生事务管理制度", "北京化工大学社会资助奖学金评定管理办法"],
        133: ["学生事务管理制度", "北京化工大学人民奖学金评审实施细则"],
        136: ["学生事务管理制度", "北京化工大学素质拓展竞赛奖评定及奖励办法"],
        138: ["学生事务管理制度", "北京化工大学校长奖评选办法"],
        140: ["学生事务管理制度", "北京化工大学家庭经济困难学生资助工作实施办法"],
        143: ["学生事务管理制度", "北京化工大学家庭经济困难学生认定工作实施办法"],
        147: ["学生事务管理制度", "北京化工大学家庭经济困难学生学费减免工作实施细则"],
        148: ["学生事务管理制度", "北京化工大学本科生国家助学金工作实施细则"],
        150: ["学生事务管理制度", "北京化工大学社会助学金实施细则"],
        153: ["学生事务管理制度", "北京化工大学校园地国家助学贷款还款救助暂行办法"],
        155: ["学生事务管理制度", "北京化工大学国家助学贷款工作实施细则"],
        158: ["学生事务管理制度", "北京化工大学关于开展学生校内无息借款工作的实施细则"],
        162: ["学生事务管理制度", "北京化工大学学生勤工助学工作实施细则"],
        167: ["学生事务管理制度", "北京化工大学学生困难补助工作实施细则"],
        169: ["学生事务管理制度", "国家助学贷款代偿实施细则"],
        172: ["学生事务管理制度", "北京化工大学服兵役学生国家教育资助工作实施细则"],
        175: ["学生事务管理制度", "北京化工大学发放本科生伙食补贴实施细则"],
        176: ["学生事务管理制度", "学生证、校徽管理"],

        # 其他管理制度 (P179-P244)
        179: ["其他管理制度", "校园文明学生公约"],
        185: ["其他管理制度", "北京化工大学学生公寓管理规定"],
        205: ["其他管理制度", "北京化工大学校园垃圾管理规定"],
        206: ["其他管理制度", "北京化工大学控烟管理办法"],
        209: ["其他管理制度", "学生食堂服务信息"],
        211: ["其他管理制度", "北京化工大学校医院新生入学须知"],
        213: ["其他管理制度", "公费医疗管理规定（试行）"],
        216: ["其他管理制度", "校园商贸服务信息"],
        217: ["其他管理制度", "运动场馆使用相关管理规定"],
        218: ["其他管理制度", "北京化工大学图书馆资源使用管理规定"],
        225: ["其他管理制度", "昌平校区图书馆存包柜使用管理细则（试行）"],
        227: ["其他管理制度", "北京化工大学校史展开放管理规定（暂行）"],
        229: ["其他管理制度", "保卫处管理及工作程序"],
        234: ["其他管理制度", "北京化工大学校园信息化服务概况"],
        237: ["其他管理制度", "北京化工大学校园卡管理办法"],
        240: ["其他管理制度", "北京化工大学校园网用户守则"],
        243: ["其他管理制度", "北京化工大学一站式服务大厅简介"],
        244: ["其他管理制度", "昌平校区玉屏山区域游园须知"],

        # 常用信息 (P247-P252)
        247: ["常用信息", "北京化工大学作息时间与节假日"],
        248: ["常用信息", "北京化工大学地理位置"],
        249: ["常用信息", "北京化工大学常用办公电话号码"],
        251: ["常用信息", "北京化工大学校歌"],
        252: ["常用信息", "北京主要高校名录"],
    }
}


# ============================================================================
# 页码与面包屑工具函数 (锚点注入方案)
# ============================================================================

# 锚点格式：使用不常见字符组合
PAGE_ANCHOR_PATTERN = r'<<<P:(\d+)>>>'


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
    
    # 找到 <= page_num 的最大页码
    valid_pages = [p for p in toc_mapping.keys() if p <= page_num]
    if not valid_pages:
        return f"【{doc_display_name}】"
    
    closest_page = max(valid_pages)
    breadcrumb_parts = toc_mapping[closest_page]
    
    return f"【{doc_display_name} > {' > '.join(breadcrumb_parts)}】"


def extract_pages_with_anchors(
    pdf_path: str,
    crop_ratio: float = DEFAULT_CROP_RATIO
) -> Tuple[str, int, Dict[int, List[str]], str]:
    """
    从 PDF 提取文本，注入页码锚点
    
    Args:
        pdf_path: PDF 文件路径
        crop_ratio: 裁切比例 (上下各裁切)
    
    Returns:
        (full_text_with_anchors, total_pages, toc_mapping, display_name)
    """
    doc = fitz.open(pdf_path)
    document_id = Path(pdf_path).stem
    total_pages = len(doc)
    
    # 解析大纲
    toc_mapping = extract_toc_mapping(doc)
    
    # 生成显示名
    display_name = document_id.replace('-', ' ').strip()
    
    # 逐页提取并注入锚点
    full_text = ""
    for page_num in range(total_pages):
        page = doc[page_num]
        page_number = page_num + 1  # 1-indexed
        
        # CropBox 裁切
        page_rect = page.rect
        margin = page_rect.height * crop_ratio
        clip = fitz.Rect(0, margin, page_rect.width, page_rect.height - margin)
        text = page.get_text("text", clip=clip).strip()
        
        # 注入锚点：在每页开头插入标记 (后跟换行符，避免干扰正则)
        anchor = f"<<<P:{page_number}>>>\n"
        full_text += anchor + text + "\n\n"
    
    doc.close()
    
    return full_text, total_pages, toc_mapping, display_name


def parse_anchors_from_chunk(chunk: str) -> Tuple[int, int, str]:
    """
    从 chunk 中解析锚点，返回当前页码和下一状态页码
    
    使用"首位优先 + 延迟更新"状态机逻辑：
    - 如果锚点在开头 (pos=0)，立即更新页码
    - 如果锚点在中间，当前 chunk 仍属于上一页
    - 处理完后，状态更新为最后一个锚点的页码
    
    Args:
        chunk: 包含锚点的文本块
    
    Returns:
        (current_page, next_page_state, clean_text)
        - current_page: 用于判定本 chunk 归属，若无锚点返回 -1 表示使用外部状态
        - next_page_state: 下一个 chunk 的初始状态，若无锚点返回 -1
        - clean_text: 清除锚点后的文本
    """
    anchors = re.findall(PAGE_ANCHOR_PATTERN, chunk)
    
    if not anchors:
        # 无锚点，返回 -1 表示使用外部状态
        return -1, -1, chunk
    
    # 找第一个锚点的位置
    first_anchor = f"<<<P:{anchors[0]}>>>"
    first_anchor_pos = chunk.find(first_anchor)
    
    if first_anchor_pos == 0:
        # 锚点在开头，立即更新
        current_page = int(anchors[0])
    else:
        # 锚点在中间，当前 chunk 仍属于上一页 (返回 -1 表示使用外部状态)
        current_page = -1
    
    # 下一状态：最后一个锚点的页码
    next_page_state = int(anchors[-1])
    
    # 清除所有锚点
    clean_text = re.sub(PAGE_ANCHOR_PATTERN, '', chunk)
    
    # 压缩连续空行：多个换行 -> 单个换行
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text)
    clean_text = clean_text.strip()
    
    return current_page, next_page_state, clean_text


# ============================================================================
# 语义流上下文 (传递给后处理器的元数据)
# ============================================================================

class SemanticContext:
    """语义流上下文，存储文档元信息"""
    
    def __init__(
        self,
        filename: str,
        document_id: str,
        display_name: str,
        total_pages: int,
        toc_mapping: Dict[int, List[str]]
    ):
        self.filename = filename
        self.document_id = document_id
        self.display_name = display_name
        self.total_pages = total_pages
        self.toc_mapping = toc_mapping
    
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
    def split(self, text: str, filename: str, ctx: Optional['SemanticContext'] = None) -> List[Document]:
        """
        执行分块 (使用锚点状态机处理页码)
        
        Args:
            text: 带锚点的全文 (<<<P:n>>>)
            filename: 文件名
            ctx: 语义上下文 (含 toc_mapping 等)
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
    
    def split(self, text: str, filename: str, ctx: Optional[SemanticContext] = None) -> List[Document]:
        """
        按 Q&A 边界切分，使用锚点状态机处理页码
        
        Args:
            text: 带锚点的全文 (<<<P:n>>>)
            filename: 文件名
            ctx: 语义上下文
        """
        chunks = []
        chunk_index = 0
        current_page = 1  # 状态机初始状态
        
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        
        # 先用正则切分（不处理锚点）
        pattern = re.compile(r'\n\d+\.\s+(?=[\u4e00-\u9fa5])')
        matches = list(pattern.finditer(text))
        
        if not matches:
            # 没有匹配到问题，按锚点处理整个文档
            anchor_page, next_state, clean_text = parse_anchors_from_chunk(text)
            page_num = anchor_page if anchor_page > 0 else 1
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            return [Document(
                page_content=f"{breadcrumb}\n\n{clean_text.strip()}",
                metadata={
                    "source": filename,
                    "strategy": self.name,
                    "document_id": document_id,
                    "chunk_index": 0,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "breadcrumb": breadcrumb
                }
            )]
        
        # 前言/目录部分 (第一个匹配之前的内容)
        first_match_start = matches[0].start()
        if first_match_start > 0:
            intro_text = text[:first_match_start]
            anchor_page, next_state, clean_intro = parse_anchors_from_chunk(intro_text)
            
            if anchor_page > 0:
                current_page = anchor_page
            page_num = current_page
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            if clean_intro.strip():
                chunks.append(Document(
                    page_content=f"{breadcrumb}\n\n【前言/目录】\n{clean_intro.strip()}",
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
            
            # 更新状态
            if next_state > 0:
                current_page = next_state
        
        # 处理每个问答对
        for i, match in enumerate(matches):
            start_pos = match.start() + 1  # +1 跳过开头的 \n
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            chunk_text = text[start_pos:end_pos]
            
            # 锚点状态机处理
            anchor_page, next_state, clean_text = parse_anchors_from_chunk(chunk_text)
            
            # 判定页码
            if anchor_page > 0:
                page_num = anchor_page  # 锚点在开头，立即更新
            else:
                page_num = current_page  # 使用上一状态
            
            breadcrumb = ctx.get_breadcrumb(page_num) if ctx else f"【{document_id}】"
            
            # 提取问题标题
            lines = clean_text.strip().split('\n')
            title = lines[0].replace('**', '').strip() if lines else ""
            
            chunks.append(Document(
                page_content=f"{breadcrumb}\n\n{clean_text.strip()}",
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
            
            # 状态流转
            if next_state > 0:
                current_page = next_state
        
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
    
    def split(self, text: str, filename: str, ctx: Optional[SemanticContext] = None) -> List[Document]:
        """按标题层级切分，使用锚点状态机处理页码，动态提取章节标题"""
        pattern = r'(第[一二三四五六七八九十百零]+条)'
        parts = re.split(pattern, text)
        chunks = []
        chunk_index = 0
        current_page = 1  # 状态机初始状态
        
        document_id = filename.replace('.pdf', '')
        total_pages = ctx.total_pages if ctx else 1
        display_name = ctx.display_name if ctx else document_id
        
        # ====== 第一步：扫描全文，建立"锚点页码 → 章节标题"映射 ======
        # 正则说明：匹配"第X章/节" + 空格和汉字（不含换行，最多15字符）
        chapter_pattern = re.compile(r'第[一二三四五六七八九十百零]+章[ \u4e00-\u9fa5]{1,15}')
        section_pattern = re.compile(r'第[一二三四五六七八九十百零]+节[ \u4e00-\u9fa5]{1,15}')
        
        # 按锚点切分全文，记录每个锚点后的章节标题
        anchor_split = re.split(PAGE_ANCHOR_PATTERN, text)
        page_to_chapter = {}  # {页码: "第X章 XXX"}
        page_to_section = {}  # {页码: "第X节 XXX"}
        
        current_scan_page = 0
        for i, segment in enumerate(anchor_split):
            if i % 2 == 1:  # 奇数位置是页码
                current_scan_page = int(segment)
            else:
                # 在这个片段中查找章节标题
                chapter_match = chapter_pattern.search(segment)
                section_match = section_pattern.search(segment)
                if chapter_match and current_scan_page > 0:
                    page_to_chapter[current_scan_page] = chapter_match.group().strip()
                if section_match and current_scan_page > 0:
                    page_to_section[current_scan_page] = section_match.group().strip()
        
        # 章节标题状态机（用于填充没有直接章节标题的页面）
        current_chapter = ""
        current_section = ""
        
        def get_chapter_for_page(page: int) -> str:
            """获取指定页码的章节标题，向前查找最近的章节"""
            nonlocal current_chapter, current_section
            
            # 如果这一页有新章节，更新状态
            if page in page_to_chapter:
                current_chapter = page_to_chapter[page]
                current_section = ""  # 新章节，重置节
            if page in page_to_section:
                current_section = page_to_section[page]
            
            return current_chapter, current_section
        
        # 获取手动 TOC 映射（如果存在）
        manual_toc = MANUAL_TOC_MAPPING.get(document_id, {})
        manual_offset = MANUAL_TOC_OFFSET.get(document_id, 0)  # 页码偏移量
        current_manual_breadcrumb = []  # 当前生效的手动面包屑
        
        def get_manual_breadcrumb_for_page(page: int) -> List[str]:
            """从手动映射表获取面包屑，使用最近的匹配页码"""
            nonlocal current_manual_breadcrumb
            
            # 将物理页码转换为逻辑页码：逻辑页码 = 物理页码 - offset
            logical_page = page - manual_offset
            
            # 找到 <= logical_page 的最大 key
            valid_pages = [p for p in manual_toc.keys() if p <= logical_page]
            if valid_pages:
                nearest_page = max(valid_pages)
                current_manual_breadcrumb = manual_toc[nearest_page]
            
            return current_manual_breadcrumb
        
        def build_breadcrumb(page_num: int) -> str:
            """构建面包屑，优先使用手动映射表"""
            # 1. 优先使用手动 TOC 映射表
            if manual_toc:
                parts = get_manual_breadcrumb_for_page(page_num)
                if parts:
                    return f"【{display_name} > {' > '.join(parts)}】"
            
            # 2. 如果有 PDF toc_mapping 且有效，使用它
            if ctx and ctx.toc_mapping:
                toc_breadcrumb = ctx.get_breadcrumb(page_num)
                if " > " in toc_breadcrumb and not toc_breadcrumb.endswith(" > 】"):
                    return toc_breadcrumb
            
            # 3. 否则使用动态提取的章节标题
            chapter, section = get_chapter_for_page(page_num)
            breadcrumb_parts = [f"【{display_name}"]
            if chapter:
                breadcrumb_parts.append(chapter)
            if section:
                breadcrumb_parts.append(section)
            breadcrumb_parts[-1] += "】"
            return " > ".join(breadcrumb_parts)
        
        # ====== 第二步：切分并构建 chunks ======
        
        # 前言部分
        if parts[0].strip() and len(parts[0].strip()) > 50:
            anchor_page, next_state, clean_intro = parse_anchors_from_chunk(parts[0])
            if anchor_page > 0:
                current_page = anchor_page
            page_num = current_page
            breadcrumb = build_breadcrumb(page_num)
            
            if clean_intro.strip():
                chunks.append(Document(
                    page_content=f"{breadcrumb}\n\n{clean_intro.strip()}",
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
            
            if next_state > 0:
                current_page = next_state
        
        # 按条组合
        for i in range(1, len(parts), 2):
            header = parts[i]
            content = parts[i+1] if i+1 < len(parts) else ""
            full_chunk = header + content
            
            if len(full_chunk.strip()) > 20:
                anchor_page, next_state, clean_text = parse_anchors_from_chunk(full_chunk)
                
                if anchor_page > 0:
                    page_num = anchor_page
                else:
                    page_num = current_page
                
                breadcrumb = build_breadcrumb(page_num)
                
                chunks.append(Document(
                    page_content=f"{breadcrumb}\n\n{clean_text.strip()}",
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
                
                if next_state > 0:
                    current_page = next_state
        
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
    
    def split(self, text: str, filename: str, ctx: Optional[SemanticContext] = None) -> List[Document]:
        """执行语义切分 (使用锚点清理)"""
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
    
    def split(self, text: str, filename: str, ctx: Optional[SemanticContext] = None) -> List[Document]:
        """执行固定窗口切分 (使用锚点清理)"""
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
    ctx: Optional[SemanticContext] = None,
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
# 幂等性保障
# ============================================================================

def clean_existing_chunks(supabase, document_id: str) -> int:
    """
    清理数据库中同 document_id 的旧 chunks (幂等性保障)
    
    Args:
        supabase: Supabase 客户端
        document_id: 文档唯一标识
    
    Returns:
        删除的 chunk 数量
    """
    try:
        # 使用 JSONB 操作符查询 metadata->>'document_id'
        result = supabase.table("documents").delete().filter(
            "metadata->>document_id", "eq", document_id
        ).execute()
        
        deleted_count = len(result.data) if result.data else 0
        return deleted_count
    except Exception as e:
        print(f"   ⚠️ 清理旧数据时出错: {e}")
        return 0


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
        
        # 使用锚点注入方案提取文本（根据文档使用不同的裁切参数）
        crop_ratio = DOCUMENT_CROP_RATIO.get(document_id, DEFAULT_CROP_RATIO)
        full_text_with_anchors, total_pages, toc_mapping, display_name = extract_pages_with_anchors(pdf_path, crop_ratio)
        
        # 清洗文本 (保留锚点，仅清理格式)
        clean_text = clean_markdown(full_text_with_anchors)
        
        # 创建语义上下文
        ctx = SemanticContext(
            filename=filename,
            document_id=document_id,
            display_name=display_name,
            total_pages=total_pages,
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
            meta = doc.metadata
            f.write(f"--- Chunk {i} ---\n")
            f.write(f"[metadata]\n")
            f.write(f"  chunk_index: {meta.get('chunk_index')}\n")
            f.write(f"  page_number: {meta.get('page_number')}\n")
            f.write(f"  total_pages: {meta.get('total_pages')}\n")
            f.write(f"  strategy: {meta.get('strategy')}\n")
            f.write(f"  document_id: {meta.get('document_id')}\n")
            f.write(f"  breadcrumb: {meta.get('breadcrumb')}\n")
            f.write(f"  title: {meta.get('title', '(无)')}\n")
            f.write(f"[content] ({len(doc.page_content)} 字符)\n")
            f.write(doc.page_content[:400])  # 只预览前 400 字符
            if len(doc.page_content) > 400:
                f.write(f"\n... (省略 {len(doc.page_content) - 400} 字符)")
            f.write(f"\n\n")
    
    print(f"\n预览已保存: {PREVIEW_FILE}")
    
    if dry_run:
        print(f"\n[DRY RUN] 共 {len(all_docs)} 块准备就绪，未上传")
        print(f"使用 --upload 参数执行实际上传")
    else:
        # 幂等性: 先清理旧数据
        print(f"\n[幂等性] 清理旧数据...")
        for doc_id in strategy_used.keys():
            doc_id_clean = doc_id.replace('.pdf', '')
            deleted = clean_existing_chunks(supabase, doc_id_clean)
            if deleted > 0:
                print(f"   已删除 {doc_id_clean} 的 {deleted} 条旧记录")
        
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
