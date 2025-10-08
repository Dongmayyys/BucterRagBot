# -*- coding: utf-8 -*-
"""
LLM-as-Judge 公平评估脚本
========================

核心思路:
- 不依赖预标注的 chunk IDs
- 对同一个问题，让两个策略分别检索
- 用 LLM 直接判断检索结果能否回答问题
- 公平比较不同策略的效果

使用方法:
    python evaluate_fair.py                    # 评估所有策略
    python evaluate_fair.py --strategies baseline qa_regex
    python evaluate_fair.py --benchmark data/benchmark_hard.json

输出:
    results/fair_eval_<timestamp>.json
    控制台对比报告
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import List, Dict, Any
from dotenv import load_dotenv
import requests

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search_service import SearchService

load_dotenv()

# ============================================================================
# 配置
# ============================================================================

BENCHMARK_FILE = "data/benchmark_hard.json"  # 默认使用难题
RESULTS_DIR = "results"
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY")

# LLM 配置
LLM_MODEL = "Qwen/Qwen3-8B"
LLM_API_URL = "https://api.siliconflow.cn/v1/chat/completions"


# ============================================================================
# LLM 评分
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
        "max_tokens": 300
    }
    
    response = requests.post(LLM_API_URL, json=payload, headers=headers)
    response.raise_for_status()
    
    return response.json()["choices"][0]["message"]["content"]


def judge_answer_quality(query: str, chunks: List[Dict]) -> Dict[str, Any]:
    """
    LLM-as-Judge: 判断检索结果能否回答问题
    
    返回:
        {
            "score": 1-5,           # 1=完全不能回答, 5=完美回答
            "can_answer": bool,     # 是否能回答 (score >= 3)
            "reasoning": str        # LLM 的判断理由
        }
    """
    if not chunks:
        return {"score": 1, "can_answer": False, "reasoning": "无检索结果"}
    
    # 拼接检索到的内容
    context = ""
    for i, chunk in enumerate(chunks[:5]):  # 只用 top-5
        content = chunk.get("content", "")[:500]
        context += f"\n【文档{i+1}】\n{content}\n"
    
    prompt = f"""你是一个 RAG 系统评估专家。请判断以下检索到的文档片段是否能够回答用户的问题。

用户问题：{query}

检索到的文档：
{context}

请按以下标准打分（1-5分）：
- 5分：文档完美回答了问题，信息完整准确
- 4分：文档能够回答问题，但可能缺少部分细节
- 3分：文档部分回答了问题，或提供了相关线索
- 2分：文档与问题相关，但无法直接回答
- 1分：文档与问题无关，完全不能回答

请严格按以下格式回答（只输出这两行）：
评分：X
理由：简要说明

注意：不要输出其他内容。"""

    try:
        response = call_llm(prompt)
        
        # 解析评分
        import re
        score_match = re.search(r'评分[：:]\s*(\d)', response)
        reason_match = re.search(r'理由[：:]\s*(.+)', response, re.DOTALL)
        
        score = int(score_match.group(1)) if score_match else 3
        score = max(1, min(5, score))  # 确保在 1-5 范围内
        reasoning = reason_match.group(1).strip()[:200] if reason_match else response[:200]
        
        return {
            "score": score,
            "can_answer": score >= 3,
            "reasoning": reasoning
        }
    except Exception as e:
        return {"score": 0, "can_answer": False, "reasoning": f"LLM 调用失败: {e}"}


# ============================================================================
# 公平评估主逻辑
# ============================================================================

def evaluate_fair(
    strategies: List[str],
    benchmark_file: str = BENCHMARK_FILE,
    top_k: int = 5
) -> Dict[str, Any]:
    """
    公平评估: 用 LLM-as-Judge 比较不同策略
    
    参数:
        strategies: 要比较的策略列表
        benchmark_file: 题库文件路径
        top_k: 每个问题检索的文档数
    
    返回:
        包含各策略评分和详细对比的字典
    """
    print(f"\n{'=' * 70}")
    print(f"LLM-as-Judge 公平评估")
    print(f"{'=' * 70}")
    print(f"评估策略: {', '.join(strategies)}")
    print(f"题库文件: {benchmark_file}")
    print(f"LLM 模型: {LLM_MODEL}")
    print(f"Top-K: {top_k}")
    print(f"{'=' * 70}\n")
    
    # 加载题库
    with open(benchmark_file, "r", encoding="utf-8") as f:
        benchmark = json.load(f)
    
    print(f"📚 加载题库: {len(benchmark)} 道题\n")
    
    # 初始化检索服务
    service = SearchService()
    
    # 存储结果
    results_by_strategy = {s: {"scores": [], "details": []} for s in strategies}
    comparison_details = []
    
    for i, item in enumerate(benchmark):
        query = item["query"]
        q_type = item.get("type", "unknown")
        
        print(f"[{i+1}/{len(benchmark)}] {query[:40]}...")
        
        question_result = {
            "id": item.get("id", f"q_{i}"),
            "query": query,
            "type": q_type,
            "strategies": {}
        }
        
        for strategy in strategies:
            # 检索
            filter_metadata = {"strategy": strategy}
            search_results = service.search(
                query, 
                use_rerank=False, 
                filter_metadata=filter_metadata
            )
            
            # LLM 评分
            judgment = judge_answer_quality(query, search_results[:top_k])
            
            # 记录结果
            results_by_strategy[strategy]["scores"].append(judgment["score"])
            results_by_strategy[strategy]["details"].append({
                "query": query,
                "type": q_type,
                "score": judgment["score"],
                "can_answer": judgment["can_answer"],
                "reasoning": judgment["reasoning"],
                "top_chunks": [c.get("content", "")[:150] for c in search_results[:3]]
            })
            
            question_result["strategies"][strategy] = {
                "score": judgment["score"],
                "can_answer": judgment["can_answer"],
                "reasoning": judgment["reasoning"]
            }
            
            status = "✅" if judgment["can_answer"] else "❌"
            print(f"  {strategy:12}: {status} {judgment['score']}/5")
        
        comparison_details.append(question_result)
    
    # 计算汇总指标
    summary = {}
    for strategy in strategies:
        scores = results_by_strategy[strategy]["scores"]
        valid_scores = [s for s in scores if s > 0]  # 排除失败的
        
        summary[strategy] = {
            "avg_score": sum(valid_scores) / len(valid_scores) if valid_scores else 0,
            "answer_rate": sum(1 for d in results_by_strategy[strategy]["details"] if d["can_answer"]) / len(scores) * 100,
            "score_distribution": {
                str(i): scores.count(i) for i in range(1, 6)
            },
            "total_questions": len(scores)
        }
    
    # 按题型分组统计
    by_type = {}
    for detail in comparison_details:
        q_type = detail["type"]
        if q_type not in by_type:
            by_type[q_type] = {s: [] for s in strategies}
        for strategy in strategies:
            by_type[q_type][strategy].append(detail["strategies"][strategy]["score"])
    
    type_summary = {}
    for q_type, strategy_scores in by_type.items():
        type_summary[q_type] = {}
        for strategy, scores in strategy_scores.items():
            valid_scores = [s for s in scores if s > 0]
            type_summary[q_type][strategy] = {
                "avg_score": sum(valid_scores) / len(valid_scores) if valid_scores else 0,
                "count": len(scores)
            }
    
    # 输出汇总
    print(f"\n{'=' * 70}")
    print("📊 公平评估结果")
    print(f"{'=' * 70}")
    
    print(f"\n{'策略':<15} {'平均分':>10} {'回答率':>10} {'5分':>6} {'4分':>6} {'3分':>6} {'2分':>6} {'1分':>6}")
    print("-" * 70)
    for strategy in strategies:
        s = summary[strategy]
        d = s["score_distribution"]
        print(f"{strategy:<15} {s['avg_score']:>10.2f} {s['answer_rate']:>9.1f}% "
              f"{d.get('5',0):>6} {d.get('4',0):>6} {d.get('3',0):>6} {d.get('2',0):>6} {d.get('1',0):>6}")
    
    print(f"\n📈 按题型分解:")
    for q_type, stats in sorted(type_summary.items()):
        scores_str = " | ".join([f"{s}: {stats[s]['avg_score']:.2f}" for s in strategies])
        print(f"  {q_type:12} (n={list(stats.values())[0]['count']:2}): {scores_str}")
    
    # 构建完整结果
    full_result = {
        "meta": {
            "timestamp": datetime.now().isoformat(),
            "strategies": strategies,
            "benchmark_file": benchmark_file,
            "llm_model": LLM_MODEL,
            "top_k": top_k,
            "benchmark_size": len(benchmark)
        },
        "summary": summary,
        "by_type": type_summary,
        "details": comparison_details
    }
    
    return full_result


def save_results(results: Dict) -> str:
    """保存评估结果"""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"fair_eval_{timestamp}.json"
    filepath = os.path.join(RESULTS_DIR, filename)
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 结果已保存: {filepath}")
    return filepath


# ============================================================================
# 入口
# ============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM-as-Judge 公平评估脚本")
    parser.add_argument(
        "--strategies",
        nargs="+",
        default=["baseline", "qa_regex"],
        help="要比较的策略列表 (默认: baseline qa_regex)"
    )
    parser.add_argument(
        "--benchmark",
        type=str,
        default=BENCHMARK_FILE,
        help="题库文件路径"
    )
    parser.add_argument("--top-k", type=int, default=5, help="Top-K 值 (默认: 5)")
    parser.add_argument("--save", action="store_true", help="保存结果到 JSON")
    
    args = parser.parse_args()
    
    # 执行评估
    results = evaluate_fair(
        strategies=args.strategies,
        benchmark_file=args.benchmark,
        top_k=args.top_k
    )
    
    # 保存结果
    if args.save:
        save_results(results)
