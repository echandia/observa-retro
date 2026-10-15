import sys
import json
import zipfile
import xml.etree.ElementTree as ET

def extract_course(xlsx_path):
    with zipfile.ZipFile(xlsx_path) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
            for elem in tree.findall(f'.//{ns}t'):
                shared_strings.append(elem.text or '')

        sheet_name = 'xl/worksheets/sheet1.xml'
        tree = ET.fromstring(z.read(sheet_name))
        ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
        
        rows = []
        for row in tree.findall(f'.//{ns}row'):
            row_vals = []
            for c in row.findall(f'{ns}c'):
                t = c.get('t')
                v = c.find(f'{ns}v')
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    idx = int(val)
                    val = shared_strings[idx] if idx < len(shared_strings) else ''
                row_vals.append(val.strip())
            if any(row_vals):
                rows.append(row_vals)

    course_title = ""
    instructor = ""
    students = []
    header_found = False

    for r in rows:
        text_line = " ".join(r)
        if "Asignatura:" in text_line:
            course_title = text_line.replace("Asignatura:", "").strip()
        elif "Profesor Responsable:" in text_line:
            instructor = text_line.replace("Profesor Responsable:", "").strip()
        elif len(r) >= 3 and ("Rut" in r or "RUT" in r) and ("Nombre" in r or "NOMBRE" in r):
            header_found = True
            continue
        elif header_found and len(r) >= 3:
            # Check if row has a valid RUT (typically digits or numbers)
            rut = r[1].replace(".", "").replace("-", "").strip()
            name = r[2].strip()
            if rut and name and rut.isdigit() and len(rut) >= 6:
                students.append({
                    "rut": rut,
                    "name": name
                })

    return {
        "course_title": course_title,
        "instructor": instructor,
        "students": students
    }

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'Listas de cursos/ED1360C_1_PRaCTICA_PEDAGoGICA_III.xlsx'
    res = extract_course(path)
    print(json.dumps(res, ensure_ascii=False, indent=2))
