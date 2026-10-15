#!/usr/bin/env python3
import sys
import zipfile
import xml.etree.ElementTree as ET

def extract_text_from_docx(file_path):
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            paragraphs = []
            for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                p_text = ''.join(node.text for node in p.iter() if node.text)
                if p_text.strip():
                    paragraphs.append(p_text.strip())
            return '\n'.join(paragraphs)
    except Exception as e:
        sys.stderr.write(f"Error extracting docx: {e}\n")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python3 extract_docx.py <path_to_docx>\n")
        sys.exit(1)
    file_path = sys.argv[1]
    text = extract_text_from_docx(file_path)
    print(text)
