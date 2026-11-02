import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(r"C:\Users\elias\OneDrive\Desktop\SST HOJE\examples\app")
SOURCE_DOCX = ROOT / "output/word/PGR-EMA-MAXIBUS-Editavel-SST-Hoje.docx"
JSON = ROOT / "data/pgr-digitalization/tenant-horizonte/9ce34336-c3c5-4598-a315-8ec457ca27ae/imported-v3.json"
OUT = ROOT / "output/word/PGR-EMA-MAXIBUS-SST-Hoje-Tabelas-Editaveis.docx"
GREEN = "006B45"
PALE = "EAF3EF"
GRAY = "D9E1DD"


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def no_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))


def border_table(table):
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), GRAY)
        borders.append(el)
    tbl_pr.append(borders)


def add_table(doc, headers, rows, widths, font_size=7.8):
    table = doc.add_table(rows=1, cols=len(headers))
    table.autofit = False
    table.style = "Table Grid"
    for idx, width in enumerate(widths):
        table.columns[idx].width = Inches(width)
    border_table(table)
    for i, label in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.width = Inches(widths[i])
        shade(cell, GREEN)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        run = p.add_run(label)
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(font_size)
        run.font.color.rgb = RGBColor(255, 255, 255)
    repeat_header(table.rows[0])
    for ridx, values in enumerate(rows):
        row = table.add_row()
        no_split(row)
        for i, value in enumerate(values):
            cell = row.cells[i]
            cell.width = Inches(widths[i])
            cell.vertical_alignment = 1
            if ridx % 2:
                shade(cell, PALE)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.0
            run = p.add_run(str(value or "—"))
            run.font.name = "Arial"
            run.font.size = Pt(font_size)
            run.font.color.rgb = RGBColor(35, 45, 42)
    return table


def section_title(doc, text, note):
    doc.add_page_break()
    h = doc.add_paragraph(style="Heading 1")
    h.add_run(text)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run(note)
    r.italic = True
    r.font.name = "Arial"
    r.font.size = Pt(8)
    r.font.color.rgb = RGBColor(80, 90, 85)


data = json.loads(JSON.read_text(encoding="utf-8"))
doc = Document(SOURCE_DOCX)

section_title(doc, "Dados do cliente para edição", "Valores transcritos ou recompostos a partir da fonte. Revise e substitua estes campos quando iniciar a documentação de outro cliente.")
company_rows = [
    ("Razão social", "EMA MAXIBUS INDÚSTRIA DE CARROCERIAS E EQUIPAMENTOS LTDA — texto recomposto da linha quebrada; confirmar", "3 e capa"),
    ("CNPJ", "08.961.232/0001-18 — confirmar", "3"),
    ("Endereço", "ALBERTO PARENTI - 1345", "3"),
    ("Bairro / Município / UF / CEP", "DISTRITO INDUSTRIAL / ERECHIM / RS / 99700-000", "3"),
    ("Telefone", "(54) 3321-0650", "3"),
    ("E-mail", "leila@ema.ind.br; deli@ema.ind.br; [e-mail de contato a confirmar]", "3"),
    ("CNAE / grau de risco", "2829-1/99 / 3", "3"),
    ("Atividade", "FABRICAÇÃO DE OUTRAS MÁQUINAS E EQUIPAMENTOS DE USO GERAL NÃO ESPECIFICADOS ANTERIORMENTE, PEÇAS E ACESSÓRIOS", "3"),
    ("Número de funcionários", "34", "3"),
    ("Responsável legal", "MILTON LUIZ PAGLIOSA", "3"),
    ("Responsável técnico", "ANEDIO JOSE MALESKI · CREA 220072735-6", "1 e 3"),
    ("Responsável pela elaboração", "ESTELA MONICA LIOTTO PARCIANELLO · MTE/RS 0008612", "1 e 3"),
    ("Data / versão", "09/2026 · 01-LD-PGR-057924=0", "1"),
]
add_table(doc, ["Campo", "Valor na cópia", "Página fonte"], company_rows, [1.35, 4.9, 0.65], 7.6)

section_title(doc, "Avaliações quantitativas em tabela editável", "Resultados e referências transcritos da origem. Campos que não constam na extração aparecem em branco; não foram estimados.")
exposure_rows = []
for exposure in data.get("exposures", []):
    exposure_rows.append((
        exposure.get("date") or "—",
        exposure.get("result") or "Não informado na extração",
        exposure.get("method") or "Não informado na extração",
        exposure.get("actionLevel") or "—",
        exposure.get("limit") or "—",
        f"p. {exposure.get('page', '—')} · revisar",
    ))
add_table(doc, ["Data", "Resultado", "Método", "Nível de ação", "Limite", "Fonte/status"], exposure_rows, [0.75, 1.15, 1.8, 1.05, 0.9, 1.25], 7.2)

section_title(doc, "Inventário de riscos em tabela editável", "Registros estruturados extraídos do PGR. A classificação de origem está marcada como pendente de revisão; valide os dados e as medidas para o cliente antes de emitir.")
risk_rows = []
for risk in data.get("risks", []):
    details = risk.get("details") or {}
    controls = []
    for measure in risk.get("measures") or []:
        controls.append(f"{measure.get('type') or 'Medida'}: {measure.get('description') or '—'}")
    for ppe in risk.get("ppe") or []:
        controls.append(f"EPI: {ppe.get('description') or ppe.get('name') or str(ppe)}")
    exposure = f"Circunstância: {details.get('circumstance') or '—'}\nFrequência: {details.get('frequency') or '—'}\nDano possível: {details.get('possibleHarm') or '—'}"
    risk_rows.append((
        f"Atividade: {risk.get('activity') or '—'}\nPerigo: {risk.get('hazard') or '—'}",
        exposure,
        "\n".join(controls) if controls else "Medidas/EPI não estruturados na extração",
        f"p. {risk.get('page', '—')}\nStatus extraído: revisar",
    ))
add_table(doc, ["Atividade e perigo", "Exposição e possíveis danos", "Controles e EPI informados", "Fonte"], risk_rows, [1.55, 2.3, 2.2, 0.85], 7.1)

section_title(doc, "Plano de ação em tabela editável", "Ações transcritas do documento de origem; responsáveis, datas, prioridades, metas e escopo devem ser confirmados para cada novo contrato.")
action_rows = []
for action in data.get("actions", []):
    f = action.get("fields") or {}
    scope = " / ".join(str(x) for x in action.get("scope") or [] if x)
    action_rows.append((
        f"{f.get('Ação Recomendada:', 'Ação a revisar')}\n{f.get('Descrição', '')}\nMeta: {f.get('Objetivo/Meta', '—')}",
        f"Prioridade: {f.get('Prioridade', '—')}\nResponsável: {f.get('Responsável', '—')}\nInício: {f.get('Início Previsto', '—')}\nConclusão: {f.get('Conclusão Prevista', '—')}",
        f"Setor/função: {scope or '—'}\nFonte: p. {action.get('page', '—')}",
    ))
add_table(doc, ["Ação recomendada, descrição e meta", "Prioridade, responsável e prazo", "Escopo e fonte"], action_rows, [3.25, 2.3, 1.35], 7.2)

doc.core_properties.title = "PGR EMA Maxibus SST Hoje com tabelas editáveis"
doc.core_properties.subject = "Cópia reconstruída com tabelas estruturadas para atualização e conferência"
doc.save(OUT)
print(OUT)
print(f"Tabelas editáveis: dados {len(company_rows)}, riscos {len(risk_rows)}, ações {len(action_rows)}")
