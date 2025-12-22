import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ContextViewerProps {
  data: {
    agent: string;
    systemPrompt: string;
    userHistory: string;
    fileContext: string;
  };
  onClose: () => void;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }> = ({ title, children, defaultOpen = true, count }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="mb-2 border border-gray-700 rounded bg-gray-900 overflow-hidden">
            <div 
                className="flex items-center p-2 bg-gray-800 cursor-pointer hover:bg-gray-750" 
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <ChevronDown size={14} className="mr-2 text-gray-500" /> : <ChevronRight size={14} className="mr-2 text-gray-500" />}
                <span className="font-semibold text-xs text-gray-300 select-none">{title}</span>
                {count !== undefined && <span className="ml-2 text-[10px] bg-gray-700 text-gray-400 px-1.5 rounded-full">{count}</span>}
            </div>
            {isOpen && <div className="p-2 border-t border-gray-700">{children}</div>}
        </div>
    );
};

const TextBlock: React.FC<{ content: string }> = ({ content }) => (
    <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {content}
    </pre>
);

const FileParser: React.FC<{ content: string }> = ({ content }) => {
    // Parser for "### FILE: path" blocks
    const parsed = useMemo(() => {
        const segments: { title: string, content: string }[] = [];
        const lines = content.split('\n');
        let currentBuffer: string[] = [];
        let currentTitle = "Preamble / Structure";

        for (const line of lines) {
            if (line.startsWith('### FILE:')) {
                if (currentBuffer.length > 0) {
                    segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
                }
                currentTitle = line.replace('### FILE:', '').trim();
                currentBuffer = [];
            } else if (line.startsWith('### FRAGMENT:')) {
                if (currentBuffer.length > 0) {
                    segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
                }
                currentTitle = line.replace('### FRAGMENT:', '').trim();
                currentBuffer = [];
            } else if (line.startsWith('### END FILE') || line.startsWith('### END FRAGMENT')) {
                 // Skip end tags, push buffer
                 if (currentBuffer.length > 0) {
                    segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
                 }
                 currentBuffer = [];
                 currentTitle = "Metadata / Spacer";
            } else if (line.startsWith('### ACTIVE CONTEXT')) {
                if (currentBuffer.length > 0) segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
                currentBuffer = [];
                currentTitle = "Active Context List";
            } else if (line.startsWith('### RECENTLY MODIFIED')) {
                if (currentBuffer.length > 0) segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
                currentBuffer = [];
                currentTitle = "Working Set (Session)";
            } else {
                currentBuffer.push(line);
            }
        }
        if (currentBuffer.length > 0 && currentBuffer.some(l => l.trim())) {
             segments.push({ title: currentTitle, content: currentBuffer.join('\n') });
        }
        return segments.filter(s => s.content.trim().length > 0);
    }, [content]);

    return (
        <div className="space-y-2">
            {parsed.map((seg, idx) => (
                <CollapsibleSection key={idx} title={seg.title}>
                    <TextBlock content={seg.content} />
                </CollapsibleSection>
            ))}
        </div>
    );
};

const HistoryParser: React.FC<{ content: string }> = ({ content }) => {
    // Heuristic parser to split "User Request:" and "### [Agent] Output:"
    const parsed = useMemo(() => {
        const parts: { title: string, content: string }[] = [];
        
        // Regex to find headers like "User Request:", "### Router Output:", "--- Next Step: Coder ---"
        // We iterate through lines to split manually for safety
        const lines = content.split('\n');
        let buffer: string[] = [];
        let header = "Start of History";

        const flush = () => {
            if (buffer.length > 0) {
                parts.push({ title: header, content: buffer.join('\n') });
                buffer = [];
            }
        };

        for (const line of lines) {
            if (line.startsWith('User Request:')) {
                flush();
                header = "User Request";
                buffer.push(line.replace('User Request:', '').trim());
            } else if (line.match(/^###\s+.*?Output:$/)) {
                flush();
                header = line.replace('###', '').replace(':', '').trim();
            } else if (line.match(/^--- Next Step:.*?---$/)) {
                 // Usually a separator, maybe just ignore or start new block
                 flush();
                 header = line.replace(/---/g, '').trim();
            } else {
                buffer.push(line);
            }
        }
        flush();

        return parts;
    }, [content]);

    return (
        <div className="space-y-2">
            {parsed.map((p, idx) => (
                <CollapsibleSection key={idx} title={p.title}>
                     <TextBlock content={p.content} />
                </CollapsibleSection>
            ))}
        </div>
    );
};

export const ContextViewer: React.FC<ContextViewerProps> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<'system' | 'history' | 'files'>('files');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
          <div>
            <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <h2 className="text-lg font-bold text-white">Pending Context Inspection</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
                Target Agent: <span className="text-blue-400 font-bold">{data.agent}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white px-3 py-1 hover:bg-gray-700 rounded">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900/50">
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            Files & Context
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'history' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            History & Input
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'system' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            System Prompt
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative bg-gray-850">
          <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar">
            {activeTab === 'system' && (
              <CollapsibleSection title="System Instructions">
                   <TextBlock content={data.systemPrompt} />
              </CollapsibleSection>
            )}
            {activeTab === 'history' && (
              <HistoryParser content={data.userHistory} />
            )}
            {activeTab === 'files' && (
              <FileParser content={data.fileContext} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 bg-gray-900 rounded-b-lg flex justify-between items-center text-xs text-gray-500">
          <span>Snapshot frozen at pause time.</span>
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm font-medium transition-colors shadow-lg">
            Return to Workflow
          </button>
        </div>
      </div>
    </div>
  );
};

