#!/usr/bin/env python3
"""index.html（静的サイトの正本）から、Artifact 用の本体だけを取り出す。

Artifact は publish 時に doctype/html/head/body を自前で付けるので、
head の中身（title・link・style）と body の中身だけを連結して渡す。
charset と viewport の meta は Artifact 側が用意するため落とす。
"""
import re
import sys
import pathlib

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "index.html").read_text(encoding="utf-8")
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "artifact.html")


def inner(tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>(.*)</{tag}>", src, re.S | re.I)
    if not m:
        sys.exit(f"{tag} が見つかりません")
    return m.group(1)


head = re.sub(r'<meta\s+(charset|name="viewport")[^>]*>\s*', "", inner("head"), flags=re.I)
out.write_text(head.strip() + "\n\n" + inner("body").strip() + "\n", encoding="utf-8")
print(f"{out} ({out.stat().st_size} bytes)")
