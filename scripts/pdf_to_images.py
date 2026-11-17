#!/usr/bin/env python3
"""把 PDF 的每一页渲染成 PNG，方便逐页识读词表。

用法：
    python pdf_to_images.py <input.pdf> <output_dir> [--dpi 200]

依赖：
    pip install pymupdf
"""
import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="PDF 逐页转 PNG")
    parser.add_argument("pdf", help="输入 PDF 路径")
    parser.add_argument("outdir", help="输出目录（不存在会自动创建）")
    parser.add_argument("--dpi", type=int, default=200, help="渲染分辨率，默认 200")
    args = parser.parse_args()

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("缺少 PyMuPDF，请先运行：pip install pymupdf", file=sys.stderr)
        return 1

    if not os.path.isfile(args.pdf):
        print("找不到文件：" + args.pdf, file=sys.stderr)
        return 1

    os.makedirs(args.outdir, exist_ok=True)
    doc = fitz.open(args.pdf)
    print("页数：", doc.page_count)
    for i in range(doc.page_count):
        page = doc[i]
        pix = page.get_pixmap(dpi=args.dpi)
        name = "page%02d.png" % (i + 1)
        path = os.path.join(args.outdir, name)
        pix.save(path)
        print("%s  %dx%d" % (path, pix.width, pix.height))

    if doc.page_count and not any(ch.isalpha() for ch in doc[0].get_text()):
        print("\n提示：这个 PDF 可能没有文字层（扫描件），请直接查看生成的图片识读。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
