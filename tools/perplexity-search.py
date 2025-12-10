#!/usr/bin/env python3
"""
Perplexity Search Tool - 使用 OpenRouter API 调用 Perplexity 模型进行搜索研究

使用方法:
    # 快速搜索 (sonar-pro-search)
    python tools/perplexity-search.py search "你的问题"
    
    # 大上下文搜索 (sonar)
    python tools/perplexity-search.py context "你的问题"
    
    # 深度研究 (sonar-deep-research)
    python tools/perplexity-search.py research "你的领域/问题"

环境变量:
    OPENROUTER_KEY - OpenRouter API 密钥 (必需)

模型说明:
    - search (sonar-pro-search): 快速 API/文档搜索
    - context (sonar): 需要更大上下文的搜索
    - research (sonar-deep-research): 深度研究，生成全面的研究报告
"""

import os
import sys
import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

MODELS = {
    "search": "perplexity/sonar-pro-search",
    "context": "perplexity/sonar",
    "research": "perplexity/sonar-deep-research",
}

MODEL_DESCRIPTIONS = {
    "search": "快速 API/文档搜索 (sonar-pro-search)",
    "context": "大上下文搜索 (sonar)",
    "research": "深度研究报告 (sonar-deep-research)",
}

SYSTEM_PROMPTS = {
    "search": """你是一个专业的技术搜索助手。用户会询问关于 API、文档、技术问题等。
请提供准确、简洁的答案，包含相关的代码示例和文档链接。
回答使用中文。""",
    
    "context": """你是一个专业的技术研究助手，擅长处理需要大量上下文的复杂问题。
请提供详细、全面的答案，包含相关的代码示例、最佳实践和文档链接。
回答使用中文。""",
    
    "research": """你是一个专业的深度研究助手。用户会给你一个领域或问题，你需要：
1. 全面调研该领域/问题的各个方面
2. 提供详尽的研究报告，包括：
   - 概述和背景
   - 核心概念和原理
   - 主要技术/方法/工具
   - 最佳实践和常见陷阱
   - 相关资源和文档链接
   - 实际代码示例（如适用）
3. 确保信息准确、全面、有深度

回答使用中文，格式清晰，便于阅读。""",
}


def get_api_key():
    """获取 OpenRouter API 密钥"""
    api_key = os.environ.get("OPENROUTER_KEY")
    if not api_key:
        print("错误: 未设置 OPENROUTER_KEY 环境变量", file=sys.stderr)
        print("请设置环境变量: export OPENROUTER_KEY='your-api-key'", file=sys.stderr)
        sys.exit(1)
    return api_key


def call_openrouter(query: str, mode: str, api_key: str) -> str:
    """调用 OpenRouter API"""
    model = MODELS[mode]
    system_prompt = SYSTEM_PROMPTS[mode]
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/pgd-LC2/aisitebuilder",
        "X-Title": "aisitebuilder-perplexity-search",
    }
    
    print(f"\n正在使用 {MODEL_DESCRIPTIONS[mode]} 进行搜索...\n")
    print(f"模型: {model}")
    print(f"问题: {query}\n")
    print("-" * 60)
    
    try:
        request = Request(
            OPENROUTER_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        
        with urlopen(request, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
            
        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            return content
        else:
            print("错误: API 返回了意外的响应格式", file=sys.stderr)
            print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}", file=sys.stderr)
            sys.exit(1)
            
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else ""
        print(f"HTTP 错误 {e.code}: {e.reason}", file=sys.stderr)
        if error_body:
            try:
                error_json = json.loads(error_body)
                print(f"错误详情: {json.dumps(error_json, indent=2, ensure_ascii=False)}", file=sys.stderr)
            except json.JSONDecodeError:
                print(f"错误详情: {error_body}", file=sys.stderr)
        sys.exit(1)
        
    except URLError as e:
        print(f"网络错误: {e.reason}", file=sys.stderr)
        sys.exit(1)
        
    except TimeoutError:
        print("错误: 请求超时 (300秒)", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Perplexity Search Tool - 使用 OpenRouter API 调用 Perplexity 模型进行搜索研究",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    # 快速搜索 API 用法
    python tools/perplexity-search.py search "OpenRouter API 如何调用 tool calling"
    
    # 大上下文搜索
    python tools/perplexity-search.py context "Supabase Edge Functions 完整教程"
    
    # 深度研究
    python tools/perplexity-search.py research "WebContainer 技术原理和最佳实践"
        """,
    )
    
    parser.add_argument(
        "mode",
        choices=["search", "context", "research"],
        help="搜索模式: search(快速搜索), context(大上下文), research(深度研究)",
    )
    
    parser.add_argument(
        "query",
        help="搜索问题或研究领域",
    )
    
    parser.add_argument(
        "-o", "--output",
        help="输出文件路径 (可选，默认输出到终端)",
    )
    
    args = parser.parse_args()
    
    api_key = get_api_key()
    result = call_openrouter(args.query, args.mode, api_key)
    
    print("\n" + "=" * 60)
    print("搜索结果:")
    print("=" * 60 + "\n")
    print(result)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(f"# Perplexity 搜索结果\n\n")
            f.write(f"**模式**: {MODEL_DESCRIPTIONS[args.mode]}\n\n")
            f.write(f"**问题**: {args.query}\n\n")
            f.write(f"---\n\n")
            f.write(result)
        print(f"\n结果已保存到: {args.output}")


if __name__ == "__main__":
    main()
