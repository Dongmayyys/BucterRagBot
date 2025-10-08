# -*- coding: utf-8 -*-
"""
RAG 检索评估脚本
================

评估指标:
- Hit Rate@K: Top-K 结果中至少命中一个正确 Chunk 的比例
- MRR (Mean Reciprocal Rank): 第一个正确结果的排名倒数的平均值
- Recall@K: Top-K 结果中命中的正确 Chunk 数量 / 总正确 Chunk 数量

使用方法:
    python evaluate.py --strategy qa_regex           # 评估特定策略
    python evaluate.py --strategy qa_regex --rerank  # 启用 Rerank
    python evaluate.py --all                         # 评估所有策略

输出:
    results/<timestamp>_<strategy>.json (详细日志)
    控制台汇总报告
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_service import SearchService

load_dotenv()

# ============================================================================
# 配置
# ============================================================================

BENCHMARK_TEMPLATE = "data/benchmark_queries.json"  # 原始题库模板
RESULTS_DIR = "results"


# ============================================================================
# 指标计算函数
# ============================================================================

def calculate_hit_rate(retrieved_ids: List[str], expected_ids: List[str], k: int) -> float:
    """
    Hit Rate@K: Top-K 结果中是否至少命中一个正确 Chunk
    
    返回: 1.0 (命中) 或 0.0 (未命中)
    """
    top_k_ids = set(retrieved_ids[:k])
    expected_set = set(expected_ids)
    
    return 1.0 if len(top_k_ids & expected_set) > 0 else 0.0


def calculate_mrr(retrieved_ids: List[str], expected_ids: List[str]) -> float:
    """
    MRR (Reciprocal Rank): 第一个正确结果的排名倒数
    
    例如:
    - 正确答案在第 1 位 → RR = 1.0
    - 正确答案在第 3 位 → RR = 1/3 = 0.33
    - 没有正确答案 → RR = 0.0
    """
    expected_set = set(expected_ids)
    
    for i, doc_id in enumerate(retrieved_ids):
        if doc_id in expected_set:
            return 1.0 / (i + 1)
    
    return 0.0


def calculate_recall(retrieved_ids: List[str], expected_ids: List[str], k: int) -> float:
    """
    Recall@K: Top-K 结果中命中的正确 Chunk 比例
    
    公式: |Retrieved ∩ Expected| / |Expected|
    
    适用于需要多个 Chunk 才能完整回答的问题
    """
    if not expected_ids:
        return 0.0
    
    top_k_ids = set(retrieved_ids[:k])
    expected_set = set(expected_ids)
    
    hits = len(top_k_ids & expected_set)
    return hits / len(expected_set)


# ============================================================================
# 评估主逻辑
# ============================================================================

def load_benchmark(strategy: str = None, benchmark_file: str = None) -> List[Dict]:
    """
    加载基准题库
    
    优先级:
    1. 如果指定了 benchmark_file，直接使用
    2. 如果指定了策略，尝试加载 benchmark_<strategy>.json
    3. 回退到原始模板
    """
    # 优先使用指定的 benchmark 文件
    if benchmark_file:
        if os.path.exists(benchmark_file):
            print(f"📚 加载自定义题库: {benchmark_file}")
            with open(benchmark_file, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            print(f"❌ 指定的题库文件不存在: {benchmark_file}")
            sys.exit(1)
    
    if strategy:
        strategy_file = f"data/benchmark_{strategy}.json"
        if os.path.exists(strategy_file):
            print(f"📚 加载策略题库: {strategy_file}")
            with open(strategy_file, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            print(f"⚠️ 策略题库不存在: {strategy_file}，使用原始模板")
    
    print(f"📚 加载原始题库模板: {BENCHMARK_TEMPLATE}")
    with open(BENCHMARK_TEMPLATE, "r", encoding="utf-8") as f:
        return json.load(f)


def evaluate(
    strategy: str = None,
    use_rerank: bool = False,
    top_k: int = 5,
    benchmark_file: str = None
) -> Dict[str, Any]:
    """
    执行评估
    
    参数:
        strategy: 过滤特定策略的 Chunk (如 'qa_regex', 'baseline')
        use_rerank: 是否启用 Rerank
        top_k: 评估的 Top-K 值
    
    返回:
        包含汇总指标和详细结果的字典
    """
    print(f"\n{'=' * 60}")
    print(f"RAG 检索评估")
    print(f"{'=' * 60}")
    print(f"策略过滤: {strategy or '(全部)'}")
    print(f"Rerank: {'启用' if use_rerank else '禁用'}")
    print(f"Top-K: {top_k}")
    print(f"{'=' * 60}\n")
    
    # 加载题库 (优先加载自定义题库 > 策略题库 > 原始模板)
    benchmark = load_benchmark(strategy, benchmark_file)
    print(f"题目数: {len(benchmark)}\n")
    
    # 初始化检索服务
    service = SearchService()
    
    # 构建过滤条件
    filter_metadata = {"strategy": strategy} if strategy else None
    
    # 存储结果
    results = []
    hit_rates_1 = []
    hit_rates_5 = []
    mrrs = []
    recalls_5 = []
    
    # 按题型分组统计
    by_type = {}
    
    for i, item in enumerate(benchmark):
        query = item["query"]
        expected_ids = item.get("expected_chunk_ids", [])
        q_type = item.get("type", "unknown")
        
        print(f"[{i+1}/{len(benchmark)}] {query[:30]}...", end=" ")
        
        # 执行检索
        search_results = service.search(
            query, 
            use_rerank=use_rerank, 
            filter_metadata=filter_metadata
        )
        
        # 提取检索到的 ID
        retrieved_ids = [r.get("id", "") for r in search_results]
        
        # 计算指标
        hit_1 = calculate_hit_rate(retrieved_ids, expected_ids, k=1)
        hit_5 = calculate_hit_rate(retrieved_ids, expected_ids, k=top_k)
        mrr = calculate_mrr(retrieved_ids, expected_ids)
        recall_5 = calculate_recall(retrieved_ids, expected_ids, k=top_k)
        
        # 记录
        hit_rates_1.append(hit_1)
        hit_rates_5.append(hit_5)
        mrrs.append(mrr)
        recalls_5.append(recall_5)
        
        # 按题型统计
        if q_type not in by_type:
            by_type[q_type] = {"hit_1": [], "hit_5": [], "mrr": [], "recall_5": []}
        by_type[q_type]["hit_1"].append(hit_1)
        by_type[q_type]["hit_5"].append(hit_5)
        by_type[q_type]["mrr"].append(mrr)
        by_type[q_type]["recall_5"].append(recall_5)
        
        # 详细结果
        result_detail = {
            "query": query,
            "type": q_type,
            "expected_ids": expected_ids,
            "retrieved_ids": retrieved_ids[:top_k],
            "hit_rate_1": hit_1,
            "hit_rate_5": hit_5,
            "mrr": mrr,
            "recall_5": recall_5,
            "retrieved_snippets": [r.get("content", "")[:100] for r in search_results[:3]]
        }
        results.append(result_detail)
        
        # 输出状态
        status = "✅" if hit_5 > 0 else "❌"
        print(f"{status} Hit@5={hit_5:.0f} MRR={mrr:.2f}")
    
    # 计算汇总指标
    metrics = {
        "hit_rate_1": sum(hit_rates_1) / len(hit_rates_1) if hit_rates_1 else 0,
        "hit_rate_5": sum(hit_rates_5) / len(hit_rates_5) if hit_rates_5 else 0,
        "mrr": sum(mrrs) / len(mrrs) if mrrs else 0,
        "recall_5": sum(recalls_5) / len(recalls_5) if recalls_5 else 0,
    }
    
    # 按题型汇总
    by_type_summary = {}
    for q_type, scores in by_type.items():
        by_type_summary[q_type] = {
            "count": len(scores["hit_1"]),
            "hit_rate_1": sum(scores["hit_1"]) / len(scores["hit_1"]) if scores["hit_1"] else 0,
            "hit_rate_5": sum(scores["hit_5"]) / len(scores["hit_5"]) if scores["hit_5"] else 0,
            "mrr": sum(scores["mrr"]) / len(scores["mrr"]) if scores["mrr"] else 0,
        }
    
    # 输出汇总
    print(f"\n{'=' * 60}")
    print("📊 汇总结果")
    print(f"{'=' * 60}")
    print(f"Hit Rate@1: {metrics['hit_rate_1']*100:.1f}%")
    print(f"Hit Rate@5: {metrics['hit_rate_5']*100:.1f}%")
    print(f"MRR:        {metrics['mrr']:.3f}")
    print(f"Recall@5:   {metrics['recall_5']*100:.1f}%")
    
    print(f"\n📈 按题型分解:")
    for q_type, stats in sorted(by_type_summary.items()):
        print(f"  {q_type:12} (n={stats['count']:2}): Hit@1={stats['hit_rate_1']*100:5.1f}% | Hit@5={stats['hit_rate_5']*100:5.1f}% | MRR={stats['mrr']:.2f}")
    
    # 构建完整结果
    full_result = {
        "meta": {
            "timestamp": datetime.now().isoformat(),
            "strategy": strategy,
            "use_rerank": use_rerank,
            "top_k": top_k,
            "benchmark_size": len(benchmark)
        },
        "metrics": metrics,
        "by_type": by_type_summary,
        "details": results
    }
    
    return full_result


def save_results(results: Dict, strategy: str):
    """保存评估结果到 JSON 文件"""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{strategy or 'all'}.json"
    filepath = os.path.join(RESULTS_DIR, filename)
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 结果已保存: {filepath}")
    return filepath


# ============================================================================
# 入口
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RAG 检索评估脚本")
    parser.add_argument(
        "--strategy",
        choices=["qa_regex", "title_hierarchy", "semantic", "baseline", None],
        default=None,
        help="评估特定策略的 Chunk (默认: 全部)"
    )
    parser.add_argument("--rerank", action="store_true", help="启用 Rerank")
    parser.add_argument("--top-k", type=int, default=5, help="Top-K 值 (默认: 5)")
    parser.add_argument("--save", action="store_true", help="保存结果到 JSON")
    parser.add_argument("--benchmark", type=str, default=None, help="自定义题库文件路径 (如 data/benchmark_hard.json)")
    
    args = parser.parse_args()
    
    # 执行评估
    results = evaluate(
        strategy=args.strategy,
        use_rerank=args.rerank,
        top_k=args.top_k,
        benchmark_file=args.benchmark
    )
    
    # 保存结果
    if args.save:
        save_results(results, args.strategy)
