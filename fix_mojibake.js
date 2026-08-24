const fs = require('fs');

// Windows-1251 to Unicode mapping
const cp1251 = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";

function fixMojibake(text) {
    let result = '';
    let i = 0;
    while (i < text.length) {
        // Find the index of the character in the cp1251 mapping
        let char = text[i];
        let idx = cp1251.indexOf(char);
        
        if (idx !== -1 && idx > 127) {
            // It's a CP1251 character (which was originally a byte of UTF-8)
            // Let's collect a sequence of CP1251 characters
            let bytes = [];
            while (i < text.length) {
                let idx2 = cp1251.indexOf(text[i]);
                if (idx2 !== -1) {
                    bytes.push(idx2);
                    i++;
                } else {
                    break;
                }
            }
            // Now decode these bytes as UTF-8
            try {
                let decoded = new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes));
                result += decoded;
            } catch (e) {
                // If it fails, just append the original characters
                for (let b of bytes) {
                    result += cp1251[b];
                }
            }
        } else {
            result += char;
            i++;
        }
    }
    return result;
}

function processFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    const fixed = fixMojibake(text);
    fs.writeFileSync(filePath, fixed, 'utf-8');
}

processFile('src/components/channel/AIPersonaReport.tsx');
processFile('src/app/api/reports/[id]/export/route.ts');
console.log("Done");
