import React, { useState, useEffect } from 'react';
import { Check, X, MessageSquare } from 'lucide-react';
import { CHANNELS } from '@/shared/constants';

interface ITaskProposal {
    id: string;
    description: string;
}

export const TaskVerification: React.FC = () => {
    const [proposal, setProposal] = useState<ITaskProposal | null>(null);
    const [comment, setComment] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    useEffect(() => {
        if (window.electron) {
            const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.REQUEST_TASK_CONFIRMATION, (data: ITaskProposal) => {
                setProposal(data);
                setComment('');
                setIsRejecting(false);
            });
            return () => removeListener();
        }
    }, []);

    const handleConfirm = async () => {
        if (!proposal || !window.electron) return;
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.TASK_CONFIRMATION_DECISION, {
            id: proposal.id,
            status: 'confirmed'
        });
        setProposal(null);
    };

    const handleReject = async () => {
        if (!proposal || !window.electron) return;
        if (!comment.trim()) {
            setIsRejecting(true);
            return;
        }
        await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.TASK_CONFIRMATION_DECISION, {
            id: proposal.id,
            status: 'rejected',
            comment: comment
        });
        setProposal(null);
    };

    if (!proposal) return null;

    return (
        <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center mb-3">
                <Check className="text-blue-400 mr-2" size={18} />
                <span className="font-bold text-blue-100">Verify Task Completion</span>
            </div>
            
            <p className="text-sm text-gray-300 mb-4 bg-black/30 p-3 rounded border border-blue-900/50 italic">
                "{proposal.description}"
            </p>

            {isRejecting && (
                <div className="mb-4">
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Reason for rejection:</label>
                    <textarea 
                        className="w-full bg-gray-900 border border-red-900/50 rounded p-2 text-sm text-white focus:outline-none focus:border-red-500"
                        rows={2}
                        placeholder="Explain what is missing or wrong..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />
                </div>
            )}

            <div className="flex space-x-3">
                {!isRejecting ? (
                    <>
                        <button 
                            onClick={() => setIsRejecting(true)}
                            className="flex-1 flex items-center justify-center px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded text-sm transition-colors border border-red-900/50"
                        >
                            <X size={14} className="mr-1.5" /> No, Reject
                        </button>
                        <button 
                            onClick={handleConfirm}
                            className="flex-1 flex items-center justify-center px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors font-medium shadow-lg"
                        >
                            <Check size={14} className="mr-1.5" /> Yes, Confirmed
                        </button>
                    </>
                ) : (
                    <>
                         <button 
                            onClick={() => setIsRejecting(false)}
                            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
                        >
                            Back
                        </button>
                        <button 
                            onClick={handleReject}
                            className="flex-1 flex items-center justify-center px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm transition-colors font-medium shadow-lg"
                        >
                            <MessageSquare size={14} className="mr-1.5" /> Submit Rejection
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
