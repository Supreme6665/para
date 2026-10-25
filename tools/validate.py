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
SYNONYM_GAME = ROOT / "data" / "synonym-game.json"

TIERS = ("strong", "close", "loose")

TYPES = {"vocab", "literal", "figurative", "language", "term"}
ORIGINS = {"exam", "adapted", "created"}
REQUIRED = {
    "id": str,
    "word": str,
    "paper": str,
    "paperShort": str,
    "passage": int,
    "questionNo": int,
    "questionType": str,
    "origin": str,
    "marks": int,
    "question": str,
    "context": str,
    "sentence": str,
    "target": str,
    "modelAnswers": list,
    "concepts": list,
    "note": str,
}


def fail(errors: list[str], msg: str) -> None:
    errors.append(msg)


def validate_synonym_game(errors: list[str], warnings: list[str]) -> None:
    try:
        game = json.loads(SYNONYM_GAME.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(errors, f"synonym-game.json: could not read ({exc})")
        return

    if game.get("schemaVersion") != 1:
        fail(errors, "synonym-game.json: schemaVersion should be 1")

    seconds = game.get("roundSeconds")
    if not isinstance(seconds, int) or not 10 <= seconds <= 300:
        fail(errors, "synonym-game.json: roundSeconds should be an integer from 10 to 300")

    minimum = game.get("minSynonyms")
    if not isinstance(minimum, int) or minimum < 1:
        fail(errors, "synonym-game.json: minSynonyms should be a positive integer")

    blocklist = game.get("blocklist", [])
    if not isinstance(blocklist, list):
        fail(errors, "synonym-game.json: blocklist should be a list")
        blocklist = []
    seen_blocked: set[str] = set()
    for word in blocklist:
        if not isinstance(word, str) or not re.fullmatch(r"[a-z]+", word):
            fail(errors, f"synonym-game.json: blocklist entry {word!r} should be a lowercase word")
            continue
        if word in seen_blocked:
            fail(errors, f"synonym-game.json: duplicate blocklist entry {word!r}")
        seen_blocked.add(word)

    overrides = game.get("overrides", {})
    if not isinstance(overrides, dict):
        fail(errors, "synonym-game.json: overrides should be an object")
        return
    for word, tiers in overrides.items():
        if not isinstance(word, str) or not re.fullmatch(r"[a-z]+", word):
            fail(errors, f"synonym-game.json: override key {word!r} should be a lowercase word")
            continue
        if not isinstance(tiers, dict):
            fail(errors, f"synonym-game.json: override for {word!r} should be an object")
            continue
        unknown = set(tiers) - set(TIERS) - {"reject"}
        if unknown:
            fail(errors, f"synonym-game.json: override for {word!r} has unknown tiers {sorted(unknown)}")
        assigned: dict[str, str] = {}
        for tier in (*TIERS, "reject"):
            terms = tiers.get(tier, [])
            if not isinstance(terms, list):
                fail(errors, f"synonym-game.json: {word}.{tier} should be a list")
                continue
            for term in terms:
                if not isinstance(term, str) or not term.strip():
                    fail(errors, f"synonym-game.json: {word}.{tier} has an empty term")
                    continue
                key = term.strip().lower()
                if key == word:
                    fail(errors, f"synonym-game.json: {word}.{tier} contains the prompt itself")
                if key in assigned:
                    warnings.append(
                        f"synonym-game.json: {word!r} term {key!r} is both {assigned[key]} and {tier}"
                    )
                assigned[key] = tier


def main() -> int:
    data = json.loads(CARDS.read_text(encoding="utf-8"))
    cards = data.get("cards", [])
    errors: list[str] = []
    warnings: list[str] = []

    if not cards:
        fail(errors, "dataset has no cards")

    validate_synonym_game(errors, warnings)

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
        context = card.get("context", "")
        if target and sentence:
            count = sentence.count(target)
            if count == 0:
                fail(errors, f"{cid}: target {target!r} not found in sentence")
            elif count > 1:
                fail(errors, f"{cid}: target {target!r} occurs {count} times in sentence")
            if target.lower() not in sentence.lower():
                fail(errors, f"{cid}: target case mismatch")
        if sentence and context and sentence not in context:
            fail(errors, f"{cid}: sentence is not an exact substring of context")

        qtype = card.get("questionType", "")
        if qtype not in TYPES:
            fail(errors, f"{cid}: unknown questionType {qtype!r}")

        origin = card.get("origin", "")
        if origin not in ORIGINS:
            fail(errors, f"{cid}: unknown origin {origin!r}")

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

        if not re.search(r"[.!?][\"'”’]?$", sentence.strip()):
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
