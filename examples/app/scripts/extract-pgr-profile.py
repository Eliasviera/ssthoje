"""Extract physical pages/tables without executing PDF content or classifying risks.
Output is a source-backed draft, not a professional review. No personal data in stdout.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import pdfplumber


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def cells(row):
    return [clean(value) for value in row if clean(value)]


def extract(path):
    raw = Path(path).read_bytes()
    result = {"schemaVersion": 1, "sha256": hashlib.sha256(raw).hexdigest(), "pages": [],
              "companyFields": {}, "roles": [], "risks": [], "actionTables": []}
    with pdfplumber.open(path) as pdf:
        result["pageCount"] = len(pdf.pages)
        for number, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            tables = page.extract_tables()
            result["pages"].append({"number": number, "text": text, "tables": tables})
            rows = [cells(row) for table in tables for row in table]
            if "Identificação do Estabelecimento" in text:
                # Label/value layout, without collecting CPF as a company field.
                for label in ["Razao Social", "CNPJ", "Endereço", "Bairro", "Cidade", "UF", "CEP", "Telefone", "Email", "CNAE", "Atividade", "Grau de Risco", "N° de Funcionários"]:
                    for row in rows:
                        if row and row[0].rstrip(":") == label and len(row) > 1:
                            result["companyFields"].setdefault(label, []).append({"value": " | ".join(row[1:]), "page": number})
                # Some identification labels have no ruling lines; retain the exact line.
                for label in ["Razao Social", "CNPJ", "Endereço", "Bairro", "Cidade", "UF", "CEP", "Telefone", "Email", "CNAE", "Atividade", "Grau de Risco", "N° de Funcionários"]:
                    if label in result["companyFields"]:
                        continue
                    found = re.search(r"(?m)^" + re.escape(label) + r"\s*:\s*(.+)$", text)
                    if found:
                        result["companyFields"][label] = [{"value": found[1].strip(), "page": number}]
            role = next((row[1] for row in rows if len(row) == 2 and row[0] == "Função"), None)
            sector = next((row[1] for row in rows if len(row) == 2 and row[0] == "Setor"), None)
            if role and sector:
                start = text.find("Atividades da Função:")
                end = text.find("Número de trabalhadores", start)
                description = text[start + len("Atividades da Função:"):end].strip() if start >= 0 and end > start else ""
                workforce = next((row for row in rows if row and row[0] == "Total"), [])
                role_risks = []
                for table in tables:
                    compact = [cells(row) for row in table]
                    if compact and compact[0] == ["Perigo", "Tipo Origem", "Origem", "Probabil.", "Severidade", "Nível de Risco"]:
                        role_risks.extend(dict(zip(compact[0], row)) for row in compact[1:] if len(row) == len(compact[0]))
                result["roles"].append({"role": role, "sector": sector, "description": description,
                                        "workforceReported": workforce, "riskAssociations": role_risks, "page": number})
            activity = next((row[1] for row in rows if len(row) == 2 and row[0] == "Posto / Atividade"), None)
            hazard = next((row[1] for row in rows if len(row) == 2 and row[0] == "Perigo"), None)
            if activity and hazard:
                measures, ppe, details = [], [], {}
                for table in tables:
                    for index, row in enumerate(table):
                        compact = cells(row)
                        if len(compact) >= 2 and compact[0] in ["Med.Adm.", "EPC", "EPI", "Engenharia"]:
                            measures.append({"type": compact[0], "description": compact[1], "reportedEffectiveness": compact[2:]})
                        if len(compact) >= 3 and re.fullmatch(r"\d{3,7}", compact[0]) and compact[-1] in ["SIM", "NÃO", "NAO"]:
                            ppe.append({"ca": compact[0], "description": compact[1], "reportedChecks": compact[2:]})
                        if compact[:3] == ["Tempo exp.", "Frequência", "Agravos a Saúde"] and index + 1 < len(table):
                            next_row = table[index + 1]
                            details["exposureTime"] = clean(next_row[0])
                            details["frequency"] = clean(next_row[1])
                            details["possibleHarm"] = clean(next_row[2])
                        if compact == ["Fonte Geradora", "Meio Propag."] and index + 1 < len(table):
                            # Keep combined source cells: borders can intersect letters.
                            details["sourceAndPropagationRawCells"] = table[index + 1]
                        if compact == ["Circunstância", "Descrição dos riscos gerados pelo perigo"] and index + 1 < len(table):
                            details["circumstance"] = " | ".join(cells(table[index + 1]))
                        if len(compact) >= 2 and compact[0] in ["Obs:", "Incerteza"]:
                            details[compact[0]] = " | ".join(compact[1:])
                result["risks"].append({"activity": activity, "hazard": hazard, "page": number,
                                        "measures": measures, "ppe": ppe, "details": details,
                                        "status": "reported_pending_review"})
            if "Ação Recomendada:" in text:
                for index, table in enumerate(tables):
                    if any("Ação Recomendada:" in " ".join(cells(row)) for row in table):
                        result["actionTables"].append({"page": number, "tableIndex": index, "rows": table})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    args = parser.parse_args()
    result = extract(args.source)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print(json.dumps({"pages": result["pageCount"], "companyFields": len(result["companyFields"]),
                      "roles": len(result["roles"]), "risks": len(result["risks"]), "actionTables": len(result["actionTables"])}))
