#!/usr/bin/env python3
import sys
import os
import re
import zipfile
import zlib
import xml.etree.ElementTree as ET

def extract_from_docx_or_odt(file_path):
    try:
        with zipfile.ZipFile(file_path) as z:
            names = z.namelist()
            doc_xml = None
            if 'word/document.xml' in names:
                doc_xml = z.read('word/document.xml')
            elif 'content.xml' in names:
                doc_xml = z.read('content.xml')
            else:
                for n in names:
                    if n.endswith('document.xml') or n.endswith('content.xml'):
                        doc_xml = z.read(n)
                        break

            if not doc_xml:
                return ''

            tree = ET.fromstring(doc_xml)
            lines = []
            for p in tree.iter():
                if p.tag.endswith('}p') or p.tag == 'p':
                    parts = []
                    for node in p.iter():
                        if (node.tag.endswith('}t') or node.tag == 't') and node.text:
                            parts.append(node.text)
                        elif (node.tag.endswith('}tab') or node.tag == 'tab'):
                            parts.append(' ')
                    text = ''.join(parts).strip()
                    if text:
                        lines.append(text)
            return '\n'.join(lines)
    except Exception as e:
        return ''

def extract_from_pdf(file_path):
    try:
        with open(file_path, 'rb') as f:
            content = f.read()

        text_chunks = []
        stream_pattern = re.compile(b'stream[\r\n]+(.*?)[\r\n]+endstream', re.DOTALL)
        for match in stream_pattern.finditer(content):
            raw_stream = match.group(1)
            try:
                decomp = zlib.decompress(raw_stream)
            except Exception:
                decomp = raw_stream

            tj_matches = re.findall(rb'\((.*?)\)\s*Tj', decomp)
            for tj in tj_matches:
                text_chunks.append(tj)

            tj_arrays = re.findall(rb'\[(.*?)\]\s*TJ', decomp, re.DOTALL)
            for arr in tj_arrays:
                parts = re.findall(rb'\((.*?)\)', arr)
                text_chunks.append(b''.join(parts))

        decoded = []
        for c in text_chunks:
            try:
                s = c.decode('latin1')
                s = re.sub(r'\\([0-7]{1,3})', lambda m: chr(int(m.group(1), 8)), s)
                s = s.replace(r'\(', '(').replace(r'\)', ')').replace(r'\\', '\\')
                clean = s.strip()
                if clean:
                    decoded.append(clean)
            except Exception:
                pass

        return '\n'.join(decoded) if decoded else ''
    except Exception:
        return ''

def extract_from_binary_doc(file_path):
    try:
        with open(file_path, 'rb') as f:
            data = f.read()

        utf16_pattern = re.compile(rb'(?:[\x20-\x7e\xa0-\xff]\x00){4,}')
        matches = utf16_pattern.findall(data)
        texts = []
        for m in matches:
            try:
                s = m.decode('utf-16le').strip()
                if len(s) > 3 and not s.startswith('Microsoft') and not s.startswith('Normal.dot'):
                    texts.append(s)
            except Exception:
                pass

        if texts:
            return '\n'.join(texts)

        ascii_pattern = re.compile(rb'[\x20-\x7e\xa0-\xff]{5,}')
        matches_ascii = ascii_pattern.findall(data)
        return '\n'.join(m.decode('latin1').strip() for m in matches_ascii if len(m.strip()) > 4)
    except Exception:
        return ''

def extract_text(file_path):
    if not os.path.exists(file_path):
        return ''

    ext = os.path.splitext(file_path)[1].lower()

    if ext in ['.docx', '.odt']:
        res = extract_from_docx_or_odt(file_path)
        if res:
            return res

    if ext == '.pdf':
        res = extract_from_pdf(file_path)
        if res:
            return res

    if ext == '.doc':
        res = extract_from_binary_doc(file_path)
        if res:
            return res

    # Intentar como ZIP por si es un docx/odt con otra extensión
    try:
        res = extract_from_docx_or_odt(file_path)
        if res:
            return res
    except Exception:
        pass

    # Intentar como PDF
    try:
        res = extract_from_pdf(file_path)
        if res:
            return res
    except Exception:
        pass

    # Intentar como texto plano (utf-8 o latin-1)
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    except Exception:
        try:
            with open(file_path, 'r', encoding='latin1', errors='ignore') as f:
                return f.read()
        except Exception:
            return ''

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python3 extract_document.py <path_to_file>\n")
        sys.exit(1)
    file_path = sys.argv[1]
    text = extract_text(file_path)
    print(text)
