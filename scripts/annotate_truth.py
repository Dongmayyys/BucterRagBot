# -*- coding: utf-8 -*-
"""
LLM 自动标注脚本
================

流程:
1. 对每个问题执行高召回检索 (top_k=10)
2. 让 LLM 判断哪些 Chunk 能回答该问题
3. 自动生成带策略名的新题库文件 (不覆盖原文件)
4. 生成审阅报告供人工确认

使用方法:
    python annotate_truth.py --strategy qa_regex          # 标注特定策略
    python annotate_truth.py --strategy qa_regex --dry-run # 预览不保存

输出:
    data/benchmark_<strategy>.json (新题库，不覆盖原文件)
    docs/annotation_report_<strategy>_<timestamp>.md (审阅报告)
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import List, Dict, Tuple
from dotenv import load_dotenv
import requests

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_service import SearchService

load_dotenv()

# ============================================================================
# 配置
# ============================================================================

BENCHMARK_TEMPLATE = "data/benchmark_queries.json"  # 默认题库模板
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY")

# LLM 配置
LLM_MODEL = "Qwen/Qwen3-8B"
LLM_API_URL = "https://api.siliconflow.cn/v1/chat/completions"


# ============================================================================
# LLM 调用
# ============================================================================

def call_llm(prompt: str) -> str:
    """调用 SiliconFlow LLM API"""
    headers = {
        "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 500
    }
    
    response = requests.post(LLM_API_URL, json=payload, headers=headers)
    response.raise_for_status()
    
    return response.json()["choices"][0]["message"]["content"]


def judge_relevance(query: str, chunks: List[Dict]) -> Tuple[List[int], str]:
    """让 LLM 判断哪些 Chunk 能回答问题"""
    if not chunks:
        return [], ""
    
    # 构建 Prompt
    chunks_text = ""
    for i, chunk in enumerate(chunks):
        content = chunk.get("content", "")[:600]
        chunks_text += f"\n【Chunk {i}】\n{content}\n"
    
    prompt = f"""你是一个文档相关性判断专家。

用户问题：{query}

以下是检索到的文档片段，请判断哪些片段**包含能够回答用户问题的信息**。

{chunks_text}

请按以下格式回答：
1. 首先简要说明问题需要什么信息
2. 然后列出能回答问题的 Chunk 编号（如果有多个用逗号分隔）
3. 如果没有任何 Chunk 能回答，回答"无"

格式示例：
需要信息：关于学分制的定义
相关Chunk：0, 2
"""
    
    response = call_llm(prompt)
    
    # 解析 LLM 回答，提取 Chunk 编号
    import re
    relevant_indices = []
    
    match = re.search(r'相关\s*[Cc]hunk[：:]\s*([0-9,\s]+)', response)
    if match:
        indices_str = match.group(1)
        for s in indices_str.split(","):
            s = s.strip()
            if s.isdigit():
                idx = int(s)
                if 0 <= idx < len(chunks):
                    relevant_indices.append(idx)
    
    return relevant_indices, response


# ============================================================================
# 标注主逻辑
# ============================================================================

def annotate_benchmark(strategy: str, dry_run: bool = True, top_k: int = 10, benchmark_file: str = None):
    """
    执行 LLM 自动标注
    
    参数:
        strategy: 要标注的策略名 (qa_regex/baseline/semantic 等)
        dry_run: 是否只预览不保存
        top_k: 每个问题检索多少候选 Chunk
        benchmark_file: 自定义题库文件路径
    
    输出文件:
        data/benchmark_<strategy>.json 或 data/benchmark_<strategy>_hard.json
        docs/annotation_report_<strategy>_<timestamp>.md - 审阅报告
    """
    # 确定题库文件
    input_file = benchmark_file if benchmark_file else BENCHMARK_TEMPLATE
    
    # 根据输入文件名确定输出文件名
    if benchmark_file and "hard" in benchmark_file:
        benchmark_output = f"data/benchmark_{strategy}_hard.json"
        report_output_prefix = f"{strategy}_hard"
    else:
        benchmark_output = f"data/benchmark_{strategy}.json"
        report_output_prefix = strategy
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_output = f"docs/annotation_report_{report_output_prefix}_{timestamp}.md"
    
    print(f"\n{'=' * 60}")
    print(f"LLM 自动标注 - 策略: {strategy}")
    print(f"{'=' * 60}")
    print(f"模型: {LLM_MODEL}")
    print(f"题库文件: {input_file}")
    print(f"候选数: {top_k}")
    print(f"模式: {'预览 (dry-run)' if dry_run else '实际标注'}")
    print(f"输出题库: {benchmark_output}")
    print(f"输出报告: {report_output}")
    print(f"{'=' * 60}\n")
    
    # 加载题库
    with open(input_file, "r", encoding="utf-8") as f:
        benchmark = json.load(f)
    
    print(f"📚 加载题库: {len(benchmark)} 道题\n")
    
    # 初始化检索服务
    service = SearchService()
    
    # 标注结果
    report_lines = [
        f"# LLM 自动标注报告\n\n",
        f"- **策略**: {strategy}\n",
        f"- **模型**: {LLM_MODEL}\n",
        f"- **时间**: {timestamp}\n",
        f"- **候选数**: {top_k}\n\n",
        "---\n\n"
    ]
    
    updated_count = 0
    
    for i, item in enumerate(benchmark):
        query = item["query"]
        old_ids = item.get("expected_chunk_ids", [])
        
        print(f"[{i+1}/{len(benchmark)}] {query}")
        
        # 执行检索 (按策略过滤)
        filter_metadata = {"strategy": strategy}
        results = service.search(query, use_rerank=True, filter_metadata=filter_metadata)
        
        if not results:
            print(f"  ⚠️ 无检索结果")
            report_lines.append(f"## {i+1}. {query}\n\n⚠️ 无检索结果\n\n---\n\n")
            continue
        
        # 取 top_k 个候选
        candidates = results[:top_k]
        
        # LLM 判断
        try:
            relevant_indices, llm_response = judge_relevance(query, candidates)
        except Exception as e:
            print(f"  ❌ LLM 调用失败: {e}")
            report_lines.append(f"## {i+1}. {query}\n\n❌ LLM 调用失败: {e}\n\n---\n\n")
            continue
        
        # 提取新的 ID
        new_ids = [candidates[idx]["id"] for idx in relevant_indices if idx < len(candidates)]
        
        # 更新题库 (添加策略标记和时间戳)
        item["expected_chunk_ids"] = new_ids
        item["annotation_strategy"] = strategy
        item["annotation_timestamp"] = timestamp
        item["llm_annotation_comment"] = f"Sources: {len(new_ids)}"
        
        # 统计
        if set(new_ids) != set(old_ids):
            updated_count += 1
            status = "🔄 已更新"
        else:
            status = "✓ 无变化"
        
        print(f"  {status} -> {len(new_ids)} 个相关 Chunk")
        
        # 生成报告
        report_lines.append(f"## {i+1}. {query}\n\n")
        report_lines.append(f"**题型**: {item.get('type', 'unknown')}\n\n")
        report_lines.append(f"**LLM 判断**:\n```\n{llm_response}\n```\n\n")
        report_lines.append(f"**选中的 Chunk ID**:\n")
        for idx in relevant_indices:
            if idx < len(candidates):
                chunk = candidates[idx]
                report_lines.append(f"- `{chunk['id'][:8]}...`: {chunk['content'][:100]}...\n")
        report_lines.append(f"\n---\n\n")
    
    print(f"\n{'=' * 60}")
    print(f"📊 标注完成")
    print(f"{'=' * 60}")
    print(f"更新: {updated_count} / {len(benchmark)} 道题")
    
    if dry_run:
        print(f"\n[DRY RUN] 未保存更改")
    else:
        # 保存新题库 (不覆盖原文件)
        with open(benchmark_output, "w", encoding="utf-8") as f:
            json.dump(benchmark, f, ensure_ascii=False, indent=4)
        print(f"\n💾 新题库已保存: {benchmark_output}")
        
        # 保存报告
        os.makedirs(os.path.dirname(report_output), exist_ok=True)
        with open(report_output, "w", encoding="utf-8") as f:
            f.writelines(report_lines)
        print(f"📝 报告已保存: {report_output}")


# ============================================================================
# 入口
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM 自动标注脚本")
    parser.add_argument(
        "--strategy",
        required=True,
        choices=["qa_regex", "title_hierarchy", "semantic", "baseline"],
        help="要标注的策略名 (必填)"
    )
    parser.add_argument("--benchmark", type=str, default=None, help="自定义题库文件路径")
    parser.add_argument("--dry-run", action="store_true", help="只预览不保存")
    parser.add_argument("--top-k", type=int, default=10, help="每个问题的候选数 (默认: 10)")
    
    args = parser.parse_args()
    
    # 如果指定了自定义题库，使用它
    benchmark_file = args.benchmark if args.benchmark else BENCHMARK_TEMPLATE
    
    annotate_benchmark(
        strategy=args.strategy,
        dry_run=args.dry_run,
        top_k=args.top_k,
        benchmark_file=benchmark_file
    )
