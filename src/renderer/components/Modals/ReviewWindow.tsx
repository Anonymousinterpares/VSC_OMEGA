import React, { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, X } from 'lucide-react';
import { CHANNELS } from '@/shared/constants';

interface IProposal {
    id: string;
    type: 'new' | 'edit';
    path: string;
    original: string;
    modified: string;
}

export const ReviewWindow: React.FC = () => {
    const [proposal, setProposal] = useState<IProposal | null>(null);
    const [modifiedContent, setModifiedContent] = useState<string>('');

    useEffect(() => {
        if (window.electron) {
            const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.PROPOSE_CHANGE, (data: IProposal) => {
                setProposal(data);
                setModifiedContent(data.modified);
            });
            return () => removeListener();
        }
    }, []);

    const handleAccept = async () => {
        if (!proposal || !window.electron) return;
        
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.REVIEW_DECISION, {
            id: proposal.id,
            status: 'accepted',
            content: modifiedContent // User might have edited the right side
        });
        setProposal(null);
    };

    const handleReject = async () => {
        if (!proposal || !window.electron) return;

        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.REVIEW_DECISION, {
            id: proposal.id,
            status: 'rejected'
        });
        setProposal(null);
    };

    if (!proposal) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col p-4">
            <div className="bg-[#1e1e1e] flex-1 flex flex-col rounded-lg overflow-hidden border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4">
                    <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${proposal.type === 'new' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                            {proposal.type.toUpperCase()}
                        </span>
                        <span className="text-gray-200 font-mono text-sm">{proposal.path}</span>
                    </div>
                    <div className="flex space-x-3">
                        <button 
                            onClick={handleReject}
                            className="flex items-center px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-200 rounded text-sm transition-colors border border-red-800"
                        >
                            <X size={14} className="mr-1.5" /> Reject
                        </button>
                        <button 
                            onClick={handleAccept}
                            className="flex items-center px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors font-medium shadow-lg"
                        >
                            <Check size={14} className="mr-1.5" /> Accept Changes
                        </button>
                    </div>
                </div>

                {/* Diff Editor */}
                <div className="flex-1 relative">
                    <DiffEditor
                        original={proposal.original}
                        modified={modifiedContent}
                        onMount={(editor) => {
                            // Update state when user edits the 'modified' side
                            editor.getModifiedEditor().onDidChangeModelContent(() => {
                                setModifiedContent(editor.getModifiedEditor().getValue());
                            });
                        }}
                        options={{
                            renderSideBySide: true,
                            theme: 'vs-dark',
                            originalEditable: false,
                            readOnly: false, // Right side is editable!
                            minimap: { enabled: false }
                        }}
                    />
                </div>
                
                <div className="h-6 bg-blue-900/20 border-t border-gray-800 flex items-center px-4 text-[10px] text-blue-300">
                    <span className="font-bold mr-2">REVIEW MODE:</span>
                    You can edit the code on the right before accepting. The left side is the original file.
                </div>
            </div>
        </div>
    );
};
