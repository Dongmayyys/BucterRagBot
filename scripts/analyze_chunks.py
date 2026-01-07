# -*- coding: utf-8 -*-
"""分析大块 chunk"""
import re

# 读取预览文件
with open('docs/preview_chunks.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# 解析每个 chunk
chunks = re.split(r'--- Chunk (\d+) ---', content)
large_chunks = []

for i in range(1, len(chunks), 2):
    chunk_id = int(chunks[i])
    chunk_content = chunks[i + 1] if i + 1 < len(chunks) else ''
    
    # 提取字符数
    char_match = re.search(r'\[content\] \((\d+) 字符\)', chunk_content)
    if char_match:
        char_count = int(char_match.group(1))
        if char_count > 500:  # 大于 500 字符的 chunk
            # 提取 metadata
            doc_match = re.search(r'document_id: (.+)', chunk_content)
            page_match = re.search(r'page_number: (\d+)', chunk_content)
            title_match = re.search(r'title: (.+)', chunk_content)
            
            doc_id = doc_match.group(1).strip() if doc_match else 'unknown'
            page = page_match.group(1) if page_match else '?'
            title = title_match.group(1).strip() if title_match else '(无)'
            
            large_chunks.append({
                'id': chunk_id,
                'chars': char_count,
                'doc': doc_id,
                'page': page,
                'title': title[:30]
            })

# 排序并输出
large_chunks.sort(key=lambda x: -x['chars'])

print(f'发现 {len(large_chunks)} 个大于 500 字符的 chunk:\n')

# 写入文件
with open('docs/large_chunks.txt', 'w', encoding='utf-8') as f:
    f.write(f'发现 {len(large_chunks)} 个大于 500 字符的 chunk:\n\n')
    for c in large_chunks:
        f.write(f"Chunk {c['id']:>4}: {c['chars']:>5} 字符 | P{c['page']} | {c['doc']} | {c['title']}\n")

print('结果已保存到 docs/large_chunks.txt')
