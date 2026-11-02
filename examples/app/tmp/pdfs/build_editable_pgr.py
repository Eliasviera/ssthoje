import json
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


ROOT = Path(r"C:\Users\elias\OneDrive\Desktop\SST HOJE\examples\app")
DATA = ROOT / "data/pgr-digitalization/tenant-horizonte/9ce34336-c3c5-4598-a315-8ec457ca27ae/imported-v3.json"
LOGO = ROOT / "public/logo-sst-hoje.png"
OUT = ROOT / "output/word/PGR-EMA-MAXIBUS-Editavel-SST-Hoje.docx"


def set_cell_margins(cell, top=70, start=100, bottom=70, end=100):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    mar = tc_pr.first_child_found_in("w:tcMar")
    if mar is None:
        mar = OxmlElement("w:tcMar")
        tc_pr.append(mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def field(paragraph, name):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = f" {name} "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    display = OxmlElement("w:t")
    display.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for el in (begin, instr, separate, display, end):
        run._r.append(el)


def heading_guess(line):
    clean = line.strip()
    if not clean:
        return False
    if len(clean) <= 110 and (clean.isupper() or clean.istitle()):
        return True
    known = ("Identificação do Estabelecimento", "Introdução", "Inventário de Riscos", "Plano de Ação", "Conclusão")
    return any(clean.lower().startswith(x.lower()) for x in known)


data = json.loads(DATA.read_text(encoding="utf-8"))
OUT.parent.mkdir(parents=True, exist_ok=True)
doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.27)
section.page_height = Inches(11.69)
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.65)
section.left_margin = Inches(0.68)
section.right_margin = Inches(0.68)
section.header_distance = Inches(0.25)
section.footer_distance = Inches(0.28)

normal = doc.styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(8.7)
normal.font.color.rgb = RGBColor(35, 45, 42)
normal.paragraph_format.space_after = Pt(2)
normal.paragraph_format.line_spacing = 1.0
for style_name, size, color in (("Heading 1", 13, "006B45"), ("Heading 2", 10.5, "006B45")):
    style = doc.styles[style_name]
    style.font.name = "Arial"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.keep_with_next = True
    style.paragraph_format.space_before = Pt(6)
    style.paragraph_format.space_after = Pt(3)

# Repeating SST Hoje brand in the header and folio in the footer.
header = section.header
table = header.add_table(rows=1, cols=2, width=Inches(6.9))
table.autofit = False
table.columns[0].width = Inches(1.45)
table.columns[1].width = Inches(5.45)
for cell in table.rows[0].cells:
    set_cell_margins(cell, 0, 20, 35, 20)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
table.cell(0, 0).paragraphs[0].add_run().add_picture(str(LOGO), width=Inches(1.12))
p = table.cell(0, 1).paragraphs[0]
p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r = p.add_run("PGR  |  SST HOJE")
r.bold = True
r.font.name = "Arial"
r.font.size = Pt(8)
r.font.color.rgb = RGBColor(0, 107, 69)
footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r = footer.add_run("Cópia editável reconstruída  ·  Página ")
r.font.name = "Arial"
r.font.size = Pt(7.5)
r.font.color.rgb = RGBColor(95, 105, 100)
field(footer, "PAGE")

# Reconstructed cover, using SST Hoje instead of the client's former provider logo.
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(50)
p.add_run().add_picture(str(LOGO), width=Inches(2.1))
p = doc.add_paragraph(style="Title")
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(28)
p.paragraph_format.space_after = Pt(5)
p.add_run("Programa de Gerenciamento de Riscos")
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Inventário de Riscos Ocupacionais e Plano de Ação")
r.font.name = "Arial"
r.font.size = Pt(13)
r.font.color.rgb = RGBColor(75, 85, 80)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(26)
r = p.add_run("EMA MAXIBUS INDÚSTRIA DE CARROCERIAS E\nEQUIPAMENTOS LTDA")
r.bold = True
r.font.name = "Arial"
r.font.size = Pt(14)
r.font.color.rgb = RGBColor(35, 45, 42)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(7)
r = p.add_run("Responsável técnico informado na fonte: ANEDIO JOSE MALESKI · CREA 220072735-6\nElaboração informada na fonte: ESTELA MONICA LIOTTO PARCIANELLO · MTE/RS 0008612\nData informada na fonte: 09/2026 · Versão 01-LD-PGR-057924=0")
r.font.name = "Arial"
r.font.size = Pt(9)
r.font.color.rgb = RGBColor(75, 85, 80)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(34)
r = p.add_run("CÓPIA EDITÁVEL RECONSTRUÍDA · PARA CONFERÊNCIA")
r.bold = True
r.font.name = "Arial"
r.font.size = Pt(10)
r.font.color.rgb = RGBColor(0, 107, 69)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.left_indent = Inches(0.65)
p.paragraph_format.right_indent = Inches(0.65)
r = p.add_run("Documento reconstituído a partir do texto extraído do PDF de origem. Revise os dados do cliente, as avaliações, os responsáveis e as assinaturas antes de emitir ou utilizar esta cópia.")
r.font.name = "Arial"
r.font.size = Pt(9)
r.font.color.rgb = RGBColor(75, 85, 80)

# Keep all source pages editable as Word paragraphs and preserve their sequence.
# The original provider's repeated address header is removed; the SST Hoje brand is in Word's repeat header.
for source_page in data["pages"][1:]:
    doc.add_page_break()
    lines = source_page.get("text", "").splitlines()
    if lines and "UNIMED" in lines[0].upper():
        lines = lines[2:] if len(lines) > 1 else lines[1:]
    lines = [line.replace("milena.samoyedem@unimed-erechim.com.br", "[e-mail de contato a confirmar]") for line in lines]
    for line in lines:
        clean = line.strip()
        if not clean:
            continue
        if heading_guess(clean):
            p = doc.add_paragraph(style="Heading 2")
            p.add_run(clean)
        else:
            p = doc.add_paragraph()
            p.paragraph_format.keep_together = False
            p.add_run(clean)

doc.core_properties.title = "PGR EMA Maxibus editável SST Hoje"
doc.core_properties.subject = "Cópia reconstruída para conferência e atualização de dados do cliente"
doc.core_properties.author = "SST Hoje"
doc.core_properties.keywords = "PGR, SST Hoje, cópia editável, conferência"
doc.save(OUT)
print(OUT)
print(f"Páginas de origem incluídas: {len(data['pages']) - 1}; arquivo: {OUT.stat().st_size} bytes")
