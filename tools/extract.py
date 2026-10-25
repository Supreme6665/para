#!/usr/bin/env python3
"""Extract plain text from the PDFs in papers/ for reference.

The app never reads the PDFs at runtime; this is only a convenience for
checking a card against its source answer scheme.

Run: python3 tools/extract.py
Requires: pdftotext (poppler-utils)
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "papers"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "build" / "extracted",
        help="directory for the .txt files (default: build/extracted)",
    )
    args = parser.parse_args()

    pdfs = sorted(PAPERS.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {PAPERS}")
        return 1

    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        print("pdftotext not found. Install poppler-utils, then try again.")
        return 1

    out = args.out.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    failures = 0
    for pdf in pdfs:
        target = out / f"{pdf.stem}.txt"
        proc = subprocess.run(
            [pdftotext, "-layout", str(pdf), str(target)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            failures += 1
            print(f"FAIL  {pdf.name}: {proc.stderr.strip() or 'pdftotext failed'}")
            continue
        lines = sum(1 for _ in target.open(encoding="utf-8", errors="replace"))
        print(f"ok    {pdf.name} -> {target.relative_to(ROOT)} ({lines} lines)")

    print(f"\nExtracted {len(pdfs) - failures}/{len(pdfs)} PDFs into {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
