import React from 'react';

// Basic ANSI mappings
const COLORS: Record<string, string> = {
    '30': 'text-gray-900', '31': 'text-red-500', '32': 'text-green-500', '33': 'text-yellow-500',
    '34': 'text-blue-500', '35': 'text-magenta-500', '36': 'text-cyan-500', '37': 'text-gray-100',
    '90': 'text-gray-500', '91': 'text-red-400', '92': 'text-green-400', '93': 'text-yellow-400',
    '94': 'text-blue-400', '95': 'text-magenta-400', '96': 'text-cyan-400', '97': 'text-white',
};

const BG_COLORS: Record<string, string> = {
    '40': 'bg-gray-900', '41': 'bg-red-900', '42': 'bg-green-900', '43': 'bg-yellow-900',
    '44': 'bg-blue-900', '45': 'bg-magenta-900', '46': 'bg-cyan-900', '47': 'bg-gray-100',
};

interface AnsiSegment {
    text: string;
    fg?: string;
    bg?: string;
    bold?: boolean;
}

const parseAnsi = (input: string): AnsiSegment[] => {
    const segments: AnsiSegment[] = [];
    // Regex matches ANSI escape codes: \u001b[...m
    const regex = /\u001b\[([0-9;]*)m/g;
    
    let lastIndex = 0;
    let currentStyle = { fg: '', bg: '', bold: false };
    
    let match;
    while ((match = regex.exec(input)) !== null) {
        // Push text before the code
        const text = input.slice(lastIndex, match.index);
        if (text) {
            segments.push({ text, ...currentStyle });
        }
        
        // Parse the code
        const codes = match[1].split(';').map(c => c.trim()).filter(Boolean);
        if (codes.length === 0) codes.push('0'); // Reset if empty

        for (const code of codes) {
            if (code === '0') {
                currentStyle = { fg: '', bg: '', bold: false };
            } else if (code === '1') {
                currentStyle.bold = true;
            } else if (COLORS[code]) {
                currentStyle.fg = COLORS[code];
            } else if (BG_COLORS[code]) {
                currentStyle.bg = BG_COLORS[code];
            } else if (code === '39') {
                currentStyle.fg = ''; // Default FG
            } else if (code === '49') {
                currentStyle.bg = ''; // Default BG
            }
        }
        
        lastIndex = regex.lastIndex;
    }
    
    // Push remaining text
    const remaining = input.slice(lastIndex);
    if (remaining) {
        segments.push({ text: remaining, ...currentStyle });
    }
    
    return segments;
};

// URL Regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export const AnsiRenderer: React.FC<{ text: string }> = ({ text }) => {
    const segments = parseAnsi(text);

    return (
        <>
            {segments.map((seg, idx) => {
                let className = `${seg.fg || ''} ${seg.bg || ''} ${seg.bold ? 'font-bold' : ''}`;
                
                // Process URLs within the segment text
                const parts = seg.text.split(URL_REGEX);
                
                return (
                    <span key={idx} className={className}>
                        {parts.map((part, pIdx) => {
                            if (part.match(URL_REGEX)) {
                                return (
                                    <a 
                                        key={pIdx} 
                                        href={part} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="underline hover:text-blue-300 cursor-pointer"
                                    >
                                        {part}
                                    </a>
                                );
                            }
                            return part;
                        })}
                    </span>
                );
            })}
        </>
    );
};
