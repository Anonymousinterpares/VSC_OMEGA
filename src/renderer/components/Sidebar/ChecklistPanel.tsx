import React, { useEffect, useState } from 'react';
import { useChecklistStore } from '../../store/useChecklistStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Play, Edit2, CheckSquare, Save, Trash2 } from 'lucide-react';
import { useViewStore } from '../../store/useViewStore';
import { CHANNELS } from '../../../shared/constants';

export const ChecklistPanel: React.FC = () => {
    const { checklistContent, selectedItems, loadChecklist, saveChecklist, clearChecklist, clearSelection, toggleSelection } = useChecklistStore();
    const { settings } = useSettingsStore();
    const { setActiveView } = useViewStore();
    
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");

    useEffect(() => {
        loadChecklist();
    }, []);

    useEffect(() => {
        setEditValue(checklistContent);
    }, [checklistContent]);

    const handleSave = async () => {
        await saveChecklist(editValue);
        setIsEditing(false);
    };

    const handleClear = async () => {
        if (window.confirm("Are you sure you want to clear the entire checklist? This cannot be undone.")) {
            await clearChecklist();
            setIsEditing(false);
        }
    };

    const handleStartSession = () => {
        if (selectedItems.length === 0) return;
        
        const goalList = selectedItems.map(i => `- ${i}`).join('\n');
        const message = `I want to work on the following goals from the Master Checklist:\n${goalList}\n\nPlease create a detailed plan to achieve this.`;

        // Send to chat
        if (window.electron) {
            // We can't directly inject into chat input from here easily without coupling.
            // But we can trigger a "Preset Prompt" flow or just copy to clipboard?
            // Better: We assume the Main App has a listener or we update a 'draft' store.
            // For now, let's use a custom event or direct IPC if possible, but the cleanest way 
            // is to switch view and let the user paste, OR (better) use an event bus.
            
            // Let's try firing a global window event that ChatWindow listens to
            const event = new CustomEvent('gemini:insert-prompt', { detail: message });
            window.dispatchEvent(event);
            
            setActiveView('editor'); // Switch to main view
            clearSelection();
        }
    };

    const toggleItemDone = async (lineIndex: number, currentLine: string) => {
        const lines = checklistContent.split('\n');
        const isDone = currentLine.trim().startsWith('- [x]');
        
        if (isDone) {
            lines[lineIndex] = currentLine.replace('- [x]', '- [ ]');
        } else {
            lines[lineIndex] = currentLine.replace('- [ ]', '- [x]');
        }
        
        await saveChecklist(lines.join('\n'));
    };

    const renderList = () => {
        if (!checklistContent) return <div className="text-gray-500 italic p-4 text-sm">No checklist found. Click Edit to create one.</div>;

        return checklistContent.split('\n').map((line, idx) => {
            const isTask = line.trim().startsWith('- [ ]') || line.trim().startsWith('- [x]');
            if (!isTask) return <div key={idx} className="px-2 py-1 text-gray-400 text-xs">{line}</div>;

            const isDone = line.trim().startsWith('- [x]');
            const cleanText = line.replace(/- \[[x ]\]/, '').trim();
            const isSelected = selectedItems.includes(cleanText);

            return (
                <div key={idx} className={`flex items-start gap-2 p-2 hover:bg-[#2d2d2d] rounded group ${isSelected ? 'bg-blue-900/30' : ''}`}>
                    <input 
                        type="checkbox" 
                        checked={isDone} 
                        onChange={() => toggleItemDone(idx, line)}
                        className="mt-1 cursor-pointer"
                    />
                    <div 
                        className={`flex-1 text-sm cursor-pointer ${isDone ? 'text-gray-500 line-through' : 'text-gray-200'}`}
                        onClick={() => !isDone && toggleSelection(cleanText)}
                    > 
                        {cleanText}
                    </div>
                    {!isDone && (
                        <div className={`w-2 h-2 rounded-full mt-2 ${isSelected ? 'bg-blue-400' : 'bg-gray-700 group-hover:bg-gray-600'}`} />
                    )}
                </div>
            );
        });
    };

    return (
        <div className="flex flex-col h-full bg-[#252526] text-white">
            <div className="h-9 flex items-center justify-between px-4 bg-[#252526] text-gray-300 text-xs font-bold uppercase tracking-wider border-b border-gray-800">
                <span>Master Checklist</span>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={handleClear} 
                        className="p-1 hover:bg-red-900/40 hover:text-red-400 rounded transition-colors"
                        title="Clear Checklist"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button 
                        onClick={() => setIsEditing(!isEditing)} 
                        className={`p-1 hover:bg-gray-700 rounded ${isEditing ? 'text-blue-400' : ''}`}
                        title="Edit Checklist"
                    >
                        <Edit2 size={14} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isEditing ? (
                    <textarea
                        className="w-full h-full bg-[#1e1e1e] p-4 text-sm font-mono text-gray-300 focus:outline-none resize-none"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="- [ ] Goal 1&#10;- [ ] Goal 2"
                    />
                ) : (
                    <div className="p-2 space-y-1">
                        {renderList()}
                    </div>
                )}
            </div>

            {isEditing ? (
                 <div className="p-4 border-t border-gray-800">
                    <button 
                        onClick={handleSave}
                        className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 text-white py-2 rounded text-sm font-medium"
                    >
                        <Save size={16} /> Save Changes
                    </button>
                 </div>
            ) : (
                <div className="p-4 border-t border-gray-800">
                    <button 
                        onClick={handleStartSession}
                        disabled={selectedItems.length === 0}
                        className={`w-full flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-colors ${ 
                            selectedItems.length > 0 
                            ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        <Play size={16} /> Start Session ({selectedItems.length})
                    </button>
                    {settings.operationMode === 'documentation' && (
                        <div className="mt-2 text-[10px] text-orange-400 text-center">
                            Documentation Mode: Changes saved to .gemini/checklist.md
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};