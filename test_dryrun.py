# -*- coding: utf-8 -*-
"""临时测试脚本"""

import sys
import os
from pathlib import Path

sys.path.insert(0, 'scripts')
from ingest import *

# 处理 PDF
pdf_path = 'data/2025-本科生学习指南.pdf'
filename = os.path.basename(pdf_path)
document_id = Path(pdf_path).stem

pages_data, total_pages, toc_mapping, display_name = extract_pages_with_metadata(pdf_path)
full_text, position_to_page = build_position_to_page_map(pages_data)
clean_text = clean_markdown(full_text)

ctx = PDFContext(
    filename=filename,
    document_id=document_id,
    display_name=display_name,
    total_pages=total_pages,
    full_text=clean_text,
    position_to_page=position_to_page,
    toc_mapping=toc_mapping
)

# Q&A 切分
docs = QARegexStrategy().split(clean_text, filename, ctx)

print(f"总块数: {len(docs)}")
print(f"总页数: {total_pages}")
print(f"大纲章节: {len(toc_mapping)}")
print()

# 展示几个典型的 chunk
output = []
output.append(f"总块数: {len(docs)}")
output.append(f"总页数: {total_pages}")
output.append(f"大纲章节: {len(toc_mapping)}")
output.append("")

for i in [0, 6, 20, 50, 100, 150, 200]:
    if i < len(docs):
        doc = docs[i]
        output.append(f"{'='*60}")
        output.append(f"Chunk {i}")
        output.append(f"{'='*60}")
        output.append(f"page_number: {doc.metadata.get('page_number')}")
        output.append(f"total_pages: {doc.metadata.get('total_pages')}")
        output.append(f"breadcrumb: {doc.metadata.get('breadcrumb')}")
        output.append(f"document_id: {doc.metadata.get('document_id')}")
        output.append(f"strategy: {doc.metadata.get('strategy')}")
        output.append(f"title: {doc.metadata.get('title', '(无)')}")
        output.append(f"content_length: {len(doc.page_content)}")
        output.append("")
        output.append("--- content ---")
        output.append(doc.page_content[:300])
        if len(doc.page_content) > 300:
            output.append(f"... (省略 {len(doc.page_content) - 300} 字符)")
        output.append("")

with open('docs/dryrun_result.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(output))

print("结果已保存到 docs/dryrun_result.txt")
