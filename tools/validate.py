#!/usr/bin/env python3
"""Validate the curated card dataset.

Run: python3 tools/validate.py
Exits non-zero if any invariant fails.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "data" / "cards.json"

TYPES = {"vocab", "literal", "figurative", "language", "term"}
REQUIRED = {
    "id": str,
    "word": str,
    "paper": str,
    "paperShort": str,
    "passage": int,
    "questionNo": int,
    "questionType": str,
    "marks": int,
    "sentence": str,
    "target": str,
    "modelAnswers": list,
    "concepts": list,
    "note": str,
}


def fail(errors: list[str], msg: str) -> None:
    errors.append(msg)


def main() -> int:
    data = json.loads(CARDS.read_text(encoding="utf-8"))
    cards = data.get("cards", [])
    errors: list[str] = []
    warnings: list[str] = []

    if not cards:
        fail(errors, "dataset has no cards")

    seen: set[str] = set()
    for card in cards:
        cid = card.get("id", "<missing id>")
        for field, kind in REQUIRED.items():
            if field not in card:
                fail(errors, f"{cid}: missing field '{field}'")
            elif not isinstance(card[field], kind):
                fail(errors, f"{cid}: '{field}' should be {kind.__name__}")
        if not isinstance(card, dict):
            continue
        if cid in seen:
            fail(errors, f"{cid}: duplicate id")
        seen.add(cid)

        sentence = card.get("sentence", "")
        target = card.get("target", "")
        if target and sentence:
            count = sentence.count(target)
            if count == 0:
                fail(errors, f"{cid}: target {target!r} not found in sentence")
            elif count > 1:
                fail(errors, f"{cid}: target {target!r} occurs {count} times in sentence")
            if target.lower() not in sentence.lower():
                fail(errors, f"{cid}: target case mismatch")

        qtype = card.get("questionType", "")
        if qtype not in TYPES:
            fail(errors, f"{cid}: unknown questionType {qtype!r}")

        marks = card.get("marks", 0)
        if not 1 <= marks <= 4:
            fail(errors, f"{cid}: marks should be 1-4, got {marks}")

        concepts = card.get("concepts", [])
        if not concepts:
            fail(errors, f"{cid}: no concepts")
        total = 0
        for concept in concepts:
            tag = f"{cid}/{concept.get('id', '?')}"
            total += int(concept.get("weight", 0) or 0)
            if not concept.get("label"):
                fail(errors, f"{tag}: empty label")
            accepts = concept.get("accept", [])
            if not accepts:
                fail(errors, f"{tag}: no accept phrases")
            for phrase in accepts:
                if not isinstance(phrase, str) or not phrase.strip():
                    fail(errors, f"{tag}: empty accept phrase")
                elif len(phrase.split()) > 14:
                    warnings.append(f"{tag}: very long accept phrase ({len(phrase.split())} words)")
        if total != marks:
            fail(errors, f"{cid}: concept weights sum to {total}, marks is {marks}")

        if not card.get("modelAnswers"):
            fail(errors, f"{cid}: no model answers")
        if not card.get("note", "").strip():
            fail(errors, f"{cid}: empty note")

        for word in card.get("modelAnswers", []):
            if not isinstance(word, str) or not word.strip():
                fail(errors, f"{cid}: empty model answer")

        if len(target.split()) > 6:
            warnings.append(f"{cid}: target is long ({len(target.split())} words)")

        if not re.search(r"[.!?]['\"]?$", sentence.strip()):
            warnings.append(f"{cid}: sentence does not end with punctuation")

    # Duplicate target within the same paper is suspicious.
    pairs: dict[tuple[str, str], list[str]] = {}
    for card in cards:
        key = (card.get("paperShort", ""), card.get("target", "").lower())
        pairs.setdefault(key, []).append(card.get("id", "?"))
    for (paper, target), ids in pairs.items():
        if len(ids) > 1:
            warnings.append(f"{paper}: duplicate target {target!r} in {', '.join(ids)}")

    for warning in warnings:
        print(f"WARN  {warning}")
    for error in errors:
        print(f"ERROR {error}")

    print(f"\n{len(cards)} cards validated. {len(errors)} errors, {len(warnings)} warnings.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
