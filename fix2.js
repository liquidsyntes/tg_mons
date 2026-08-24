const fs = require('fs');

// Windows-1251 to Unicode mapping string
const cp1251 = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";

// Create a reverse map: char -> byte
let revMap = {};
for(let i = 0; i < cp1251.length; i++) {
    revMap[cp1251[i]] = i;
}

function processFile(path) {
    let text = fs.readFileSync(path, 'utf8');
    
    // We only want to convert sections that are mojibake.
    // Mojibake looks like alternating 'Р' (D0) or 'С' (D1) followed by another char.
    // Actually, since all our ASCII is < 128, it maps 1:1. So we can just convert the whole string to bytes!
    // WAIT! Our file contains things like `{ data.corePersonality.dominanceLevel }` which is pure ASCII. ASCII is 1:1 in CP1251.
    // What if the file contains legit UTF-8 Cyrillic that was NOT mojibaked?
    // Let's assume the whole file is mojibake. Let's try converting everything to bytes and decoding.
    
    let bytes = new Uint8Array(text.length);
    let valid = true;
    for(let i = 0; i < text.length; i++) {
        let b = revMap[text[i]];
        if (b === undefined) {
            // Character not in CP1251! E.g. bullet points or other legit unicode.
            valid = false;
            break;
        }
        bytes[i] = b;
    }
    
    if (valid) {
        let decoded = new TextDecoder('utf-8').decode(bytes);
        // Did it decode without error characters ()?
        if (!decoded.includes('')) {
            fs.writeFileSync(path, decoded, 'utf8');
            console.log(path, "fixed fully");
            return;
        }
    }
    
    // If we reach here, we need to do partial replacement.
    // Since some characters were NOT in CP1251 (e.g. • or new edits), we must scan for sequences of valid UTF-8 byte pairs.
    // A UTF-8 Russian character is 2 bytes: D0 xx or D1 xx.
    // In Mojibake, this looks like "Р" + something, or "С" + something.
    let out = '';
    for(let i=0; i<text.length; ) {
        let b1 = revMap[text[i]];
        if (b1 === 0xD0 || b1 === 0xD1) {
            let b2 = revMap[text[i+1]];
            if (b2 !== undefined) {
                // Try decoding this pair
                let arr = new Uint8Array([b1, b2]);
                let dec = new TextDecoder('utf-8').decode(arr);
                if (!dec.includes('')) {
                    out += dec;
                    i += 2;
                    continue;
                }
            }
        }
        
        // Also handle 3-byte UTF-8 like • (E2 80 A2) -> вЂў
        let b1_3 = revMap[text[i]];
        let b2_3 = revMap[text[i+1]];
        let b3_3 = revMap[text[i+2]];
        if (b1_3 !== undefined && b2_3 !== undefined && b3_3 !== undefined) {
             let arr = new Uint8Array([b1_3, b2_3, b3_3]);
             let dec = new TextDecoder('utf-8').decode(arr);
             if (!dec.includes('') && dec.length === 1 && dec.charCodeAt(0) > 127) {
                 out += dec;
                 i += 3;
                 continue;
             }
        }

        out += text[i];
        i++;
    }
    
    fs.writeFileSync(path, out, 'utf8');
    console.log(path, "fixed partially");
}

processFile('src/components/channel/AIPersonaReport.tsx');
processFile('src/app/api/reports/[id]/export/route.ts');
