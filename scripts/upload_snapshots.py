# -*- coding: utf-8 -*-
"""
上传 WebP 图片到 Supabase Storage
"""

import os
import hashlib
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# 配置
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_NAME = "pdf-snapshots"  # 你创建的 bucket 名称
SNAPSHOTS_DIR = "snapshots"


def get_hash_id(name: str) -> str:
    """生成短 hash ID (8 字符)"""
    return hashlib.md5(name.encode('utf-8')).hexdigest()[:8]


def upload_snapshots():
    """上传所有快照到 Supabase Storage"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 遍历 snapshots 目录
    snapshots_path = Path(SNAPSHOTS_DIR)
    if not snapshots_path.exists():
        print(f"❌ 目录不存在: {SNAPSHOTS_DIR}")
        return
    
    uploaded = 0
    errors = 0
    hash_mapping = {}  # 记录映射关系
    
    for doc_dir in snapshots_path.iterdir():
        if not doc_dir.is_dir():
            continue
        
        document_id = doc_dir.name
        hash_id = get_hash_id(document_id)
        hash_mapping[document_id] = hash_id
        
        print(f"\n📁 上传: {document_id} → {hash_id}")
        
        for webp_file in sorted(doc_dir.glob("*.webp")):
            # 远程路径: {hash_id}/page_1.webp (使用 hash 避免中文问题)
            remote_path = f"{hash_id}/{webp_file.name}"
            
            try:
                with open(webp_file, "rb") as f:
                    file_data = f.read()
                
                # 上传 (使用 upsert 覆盖已存在的文件)
                supabase.storage.from_(BUCKET_NAME).upload(
                    remote_path,
                    file_data,
                    file_options={"content-type": "image/webp", "upsert": "true"}
                )
                
                print(f"   ✓ {webp_file.name}")
                uploaded += 1
                
            except Exception as e:
                print(f"   ✗ {webp_file.name}: {e}")
                errors += 1
    
    print(f"\n✅ 上传完成: {uploaded} 成功, {errors} 失败")
    
    # 输出映射关系
    print(f"\n📋 Document ID → Hash 映射:")
    for doc_id, hash_id in hash_mapping.items():
        print(f"   {doc_id} → {hash_id}")
    
    # 输出公开 URL 示例
    if uploaded > 0 and hash_mapping:
        sample_hash = list(hash_mapping.values())[0]
        sample_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{sample_hash}/page_1.webp"
        print(f"\n📎 公开 URL 示例:")
        print(f"   {sample_url}")


if __name__ == "__main__":
    upload_snapshots()
