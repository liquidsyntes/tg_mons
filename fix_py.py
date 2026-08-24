import sys

def fix_mojibake(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # The string was read correctly as UTF-8, but it contains Mojibake.
    # This means the characters inside the string are Unicode points of CP1251 characters.
    # E.g., 'Р' is U+0420 (Cyrillic Er), but it represents byte 0xD0 in CP1251.
    # So we need to encode the string back to CP1251 bytes, and then decode those bytes as UTF-8.
    
    try:
        # Convert the string to bytes using CP1251
        raw_bytes = content.encode('cp1251')
        # Decode the bytes as UTF-8
        fixed_content = raw_bytes.decode('utf-8')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"Fixed {filepath} entirely.")
    except Exception as e:
        print(f"Could not fix {filepath} entirely: {e}")
        # Partial fix line by line or word by word
        import re
        def replace_match(match):
            mojibake = match.group(0)
            try:
                return mojibake.encode('cp1251').decode('utf-8')
            except:
                return mojibake
        
        # Match sequences of cyrillic characters which are typical in CP1251 mojibake (Р..., С...)
        fixed_content = re.sub(r'[А-Яа-яЁё]+', replace_match, content)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"Fixed {filepath} partially.")

fix_mojibake("src/components/channel/AIPersonaReport.tsx")
fix_mojibake("src/app/api/reports/[id]/export/route.ts")
