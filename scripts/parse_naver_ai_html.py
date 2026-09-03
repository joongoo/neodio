#!/usr/bin/env python3

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote_plus, urlparse

try:
    from bs4 import BeautifulSoup
except ImportError as exc:
    raise SystemExit(
        "BeautifulSoup is not installed. Run: python3 -m venv .tmp/venv && "
        ". .tmp/venv/bin/activate && pip install -r requirements-backend.txt"
    ) from exc


NAVER_AI_MODEL_ID = "model-naver-ai-search"


def normalize(value: str) -> str:
    return " ".join(value.split()).strip()


def normalize_multiline(lines: list[str]) -> str:
    return "\n\n".join(line for line in (normalize(line) for line in lines) if line)


def extract_query(url: str, fallback: str) -> str:
    if fallback:
        return fallback
    query = parse_qs(urlparse(url).query).get("query", [""])[0]
    return unquote_plus(query)


def is_useful_external_url(href: str) -> bool:
    parsed = urlparse(href)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = parsed.hostname or ""
    if host.endswith("naver.com") or host.endswith("pstatic.net"):
        return False
    return True


def remove_noise(node) -> None:
    for child in node.select(".fds-overlay-chip, button, svg, [aria-hidden='true']"):
        child.decompose()


def readable_block_text(node) -> str:
    clone = BeautifulSoup(str(node), "html.parser")
    remove_noise(clone)

    root = clone.find(attrs={"role": "row"})
    if root:
        cells = [
            normalize(cell.get_text(" ", strip=True))
            for cell in root.select("[role='columnheader'], [role='cell']")
        ]
        return " | ".join(cell for cell in cells if cell)

    return normalize(clone.get_text(" ", strip=True))


def find_answer_root(soup: BeautifulSoup):
    return soup.select_one(".fds-aib-expandable-container") or soup.select_one(".conversation-column")


def parse_answer_text(soup: BeautifulSoup) -> str:
    root = find_answer_root(soup)
    if not root:
        return ""

    blocks = []
    seen = set()
    for node in root.select(".fds-markdown-p, .fds-markdown-h, .fds-markdown-li-text, .fds-markdown-tr"):
        if node.find_parent(class_="fds-source-overlay-item"):
            continue
        parent = node.parent
        if parent and parent.find_parent(class_="fds-markdown-tr"):
            continue

        text = readable_block_text(node)
        if len(text) < 10:
            continue
        if "새 창 열림" in text:
            continue
        if "도움이 됐어요" in text or "도움되지 않았어요" in text or "신고하기" in text:
            continue
        if text.startswith("출처") and "전체보기" in text:
            continue
        if text in seen:
            continue

        seen.add(text)
        blocks.append(text)

    return normalize_multiline(blocks)


def parse_citations(soup: BeautifulSoup) -> list[dict]:
    root = soup.select_one("[aria-label='출처 정보']") or find_answer_root(soup)
    if not root:
        return []

    citations = []
    seen = set()
    for anchor in root.select("a[href], .fds-source-overlay-item[href]"):
        href = anchor.get("data-nlog-imp-url") or anchor.get("href") or ""
        if not is_useful_external_url(href):
            continue
        if href in seen:
            continue

        seen.add(href)
        host = urlparse(href).hostname or ""
        title_node = anchor.select_one(".fds-source-overlay-item-title")
        title = normalize(title_node.get_text(" ", strip=True)) if title_node else normalize(anchor.get_text(" ", strip=True))
        citations.append(
            {
                "title": title or host,
                "url": href,
                "domain": host,
                "isOwnDomain": host == "neodigm.com" or host.endswith(".neodigm.com"),
            }
        )

    return citations[:20]


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse rendered Naver AI answer HTML with BeautifulSoup.")
    parser.add_argument("--html-file", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--query", default="")
    parser.add_argument("--prompt-id", default="manual-naver-ai-html-parse")
    parser.add_argument("--market-id", default="market-kr")
    parser.add_argument("--out", default=".tmp/naver-ai")
    args = parser.parse_args()

    html_path = Path(args.html_file)
    soup = BeautifulSoup(html_path.read_text(encoding="utf8"), "html.parser")
    raw_response = parse_answer_text(soup)
    citations = parse_citations(soup)
    run_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    status = "success" if len(raw_response) >= 180 else "failed"
    error_message = None if status == "success" else "empty_ai_briefing: rendered HTML did not contain a parseable AI answer."

    result = {
        "promptRun": {
            "id": f"run-naver-ai-html-{int(datetime.now().timestamp() * 1000)}",
            "promptId": args.prompt_id,
            "llmModelId": NAVER_AI_MODEL_ID,
            "marketId": args.market_id,
            "runAt": run_at,
            "status": status,
            "rawResponse": raw_response,
            "rawMetadata": {
                "source": "naver-ai-search",
                "collectedBy": "beautifulsoup-rendered-html",
                "query": extract_query(args.url, args.query),
                "queryUrl": args.url,
                "finalUrl": args.url,
                "htmlPath": str(html_path),
                "answerTextLength": len(raw_response),
                "citations": citations,
                "errorMessage": error_message,
            },
        }
    }

    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"naver-ai-parsed-{run_at.replace(':', '-')}.json"
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    print(
        json.dumps(
            {
                "status": status,
                "outputPath": str(output_path),
                "answerTextLength": len(raw_response),
                "citations": len(citations),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
