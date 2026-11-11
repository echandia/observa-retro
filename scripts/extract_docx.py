#!/usr/bin/env python3
import sys
from extract_document import extract_text

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python3 extract_docx.py <path_to_file>\n")
        sys.exit(1)
    file_path = sys.argv[1]
    print(extract_text(file_path))
