// ============================================================
// PRAGNA — Semantic Chunking
// Split LLM outputs by ### headers, word-chunk oversized sections
// ============================================================

/**
 * Split text by Markdown ### headers.
 * Returns array of { header: string, text: string }
 */
export function splitByHeaders(text) {
    if (!text || typeof text !== 'string') return [{ header: '', text: text || '' }];

    const lines = text.split('\n');
    const sections = [];
    let currentHeader = '';
    let currentLines = [];

    for (const line of lines) {
        const headerMatch = line.match(/^###\s+(.+)/);
        if (headerMatch) {
            // Save previous section
            if (currentLines.length > 0 || currentHeader) {
                sections.push({
                    header: currentHeader,
                    text: currentLines.join('\n').trim(),
                });
            }
            currentHeader = headerMatch[1].trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    // Save last section
    if (currentLines.length > 0 || currentHeader) {
        sections.push({
            header: currentHeader,
            text: currentLines.join('\n').trim(),
        });
    }

    // Filter out empty sections (no header and no content)
    return sections.filter(s => s.header || s.text);
}

/**
 * Word-chunk text into pieces of approximately `size` words
 * with `overlap` word overlap between chunks.
 */
export function wordChunk(text, size = 700, overlap = 50) {
    if (!text) return [text || ''];

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= size) return [text];

    const chunks = [];
    let start = 0;

    while (start < words.length) {
        const end = Math.min(start + size, words.length);
        chunks.push(words.slice(start, end).join(' '));
        if (end >= words.length) break;
        start = end - overlap;
    }

    return chunks;
}

/**
 * Count words in a string.
 */
export function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Full chunking pipeline: split by ### headers, then word-chunk oversized sections.
 * Returns array of { header, text, chunkIndex }
 */
export function chunkDocument(text) {
    const sections = splitByHeaders(text);
    const result = [];
    let globalIndex = 0;

    for (const section of sections) {
        const wc = countWords(section.text);

        if (wc > 800) {
            // Oversized section → word-chunk it
            const subChunks = wordChunk(section.text, 700, 50);
            for (let i = 0; i < subChunks.length; i++) {
                result.push({
                    header: section.header + (subChunks.length > 1 ? ` (part ${i + 1})` : ''),
                    text: subChunks[i],
                    chunkIndex: globalIndex++,
                });
            }
        } else {
            result.push({
                header: section.header,
                text: section.text,
                chunkIndex: globalIndex++,
            });
        }
    }

    return result;
}
