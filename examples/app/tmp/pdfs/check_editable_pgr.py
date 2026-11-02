from pathlib import Path
from docx import Document

path = Path(r"C:\Users\elias\OneDrive\Desktop\SST HOJE\examples\app\output\word\PGR-EMA-MAXIBUS-Editavel-SST-Hoje.docx")
doc = Document(path)
body = "\n".join(p.text for p in doc.paragraphs)
print("bytes:", path.stat().st_size)
print("paragraphs:", len(doc.paragraphs))
print("tables:", len(doc.tables))
print("Unimed mentions remaining in body:", body.upper().count("UNIMED"))
print("header logo images:", len(doc.sections[0].header._element.xpath(".//a:blip")))
print("source page-break paragraphs:", sum("w:type=\"page\"" in p._p.xml for p in doc.paragraphs))
print("first 500 chars:", body[:500])
