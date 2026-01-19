# -*- coding: utf-8 -*-
"""
添加彩蛋内容到向量数据库
"""
import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY")

# 彩蛋内容（原封不动）
EASTER_EGG_CONTENT = """巴克特拥有两个技能：
1. 分解逃脱：具有打散利用自身能量分子，并融合到墙的分子的穿墙能力。
2. 暗影黑雾：暗影界独有秘术之一，能利用物体传送出现，以灵魂可以与人融为一体，还可释放暗影因子制造异能兽。"""

def add_easter_egg():
    """添加彩蛋到数据库"""
    print("🥚 添加彩蛋内容到向量数据库...\n")
    
    # 初始化
    embeddings = OpenAIEmbeddings(
        base_url="https://api.siliconflow.cn/v1",
        api_key=SILICONFLOW_API_KEY,
        model="BAAI/bge-m3",
        check_embedding_ctx_length=False
    )
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 生成 embedding
    print("生成向量...")
    embedding = embeddings.embed_query(EASTER_EGG_CONTENT)
    print(f"✓ 向量维度: {len(embedding)}")
    
    # 构建元数据
    metadata = {
        "source": "2015-巴克特技能.pdf",
        "document_id": "2015-巴克特技能",
        "chunk_index": 0,
        "page_number": 1,
        "total_pages": 1,
        "strategy": "easter_egg",
        "breadcrumb": "【2015-巴克特技能】",
        "custom_image_url": "https://nybrcifleyophzvzrhxb.supabase.co/storage/v1/object/public/pdf-snapshots/downloaded-image%20(3).png"
    }
    
    # 插入数据库
    print("\n上传到 Supabase...")
    result = supabase.table("documents").insert({
        "content": EASTER_EGG_CONTENT,
        "metadata": metadata,
        "embedding": embedding
    }).execute()
    
    print(f"✅ 彩蛋已添加！ID: {result.data[0]['id']}")
    print(f"\n内容预览:\n{EASTER_EGG_CONTENT[:100]}...")

if __name__ == "__main__":
    add_easter_egg()
