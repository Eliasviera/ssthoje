"""Recover whole words crossing table rules using the printed column heading.
Never rewrite wording: accept only when the character stream is unchanged.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pdfplumber


def stream(value):
    return re.sub(r"\s+", "", value)


def recover(words, anchor, boundary, original):
    crossing = [word for word in words if word["x0"] < boundary < word["x1"]]
    # A whole word must start at the printed right-column heading, independently
    # of the (misaligned) ruling line. Refuse overflowing left-column words.
    if not crossing or any(abs(word["x0"] - anchor) > 1 for word in crossing):
        return None
    left = [word for word in words if word not in crossing and word["x0"] < anchor]
    right = [word for word in words if word in crossing or word["x0"] >= anchor]
    if not left or not right:
        return None
    order = lambda word: (round(word["top"], 1), word["x0"])
    source = " ".join(word["text"] for word in sorted(left, key=order))
    propagation = " ".join(word["text"] for word in sorted(right, key=order))
    if stream(source + propagation) != stream("".join(value or "" for value in original)):
        return None
    if [source, propagation] == [value for value in original if value]:
        return None
    return {"source": source, "propagation": propagation,
            "anchorX": anchor, "boundaryX": boundary,
            "crossingWords": [{key: word[key] for key in ["text", "x0", "x1", "top"]} for word in crossing]}


def analyze(pdf_path, profile_path):
    raw = Path(pdf_path).read_bytes()
    source = json.loads(Path(profile_path).read_text(encoding="utf-8"))
    digest = hashlib.sha256(raw).hexdigest()
    if digest != source["sha256"]:
        raise ValueError("PDF diverge da fonte")
    corrections = []
    with pdfplumber.open(pdf_path) as pdf:
        for risk in source["risks"]:
            page = pdf.pages[risk["page"] - 1]
            for table in page.find_tables():
                extracted = table.extract()
                if not extracted or [value for value in extracted[0] if value] != ["Fonte Geradora", "Meio Propag."]:
                    continue
                header, data = table.rows[0], table.rows[1]
                header_cells = [cell for cell in header.cells if cell]
                if len(header_cells) != 2:
                    continue
                htop, hbottom = header_cells[1][1], header_cells[1][3]
                boundary = header_cells[1][0]
                words = page.extract_words()
                anchors = [word["x0"] for word in words if word["text"] == "Meio" and htop <= (word["top"] + word["bottom"]) / 2 <= hbottom and abs(word["x0"] - boundary) < 10]
                if len(anchors) != 1:
                    continue
                actual = [cell for cell in data.cells if cell]
                top, bottom = min(cell[1] for cell in actual), max(cell[3] for cell in actual)
                row_words = [word for word in words if top <= (word["top"] + word["bottom"]) / 2 <= bottom]
                original = risk["details"].get("sourceAndPropagationRawCells")
                if original != extracted[1]:
                    continue
                fixed = recover(row_words, anchors[0], boundary, original)
                if fixed:
                    corrections.append({"page": risk["page"], "before": original, **fixed})
    return {"schemaVersion": 1, "method": "printed-header-whole-word-v1", "sha256": digest, "corrections": corrections}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("profile")
    parser.add_argument("output")
    args = parser.parse_args()
    result = analyze(args.pdf, args.profile)
    with Path(args.output).open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
    print(json.dumps({"verifiedCorrections": len(result["corrections"])}))
