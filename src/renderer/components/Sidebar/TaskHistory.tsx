import React from 'react';
import { useHistoryStore, SavedTask } from '../../store/useHistoryStore';
import { History, Trash2, RotateCcw, MessageSquare, CheckSquare, Clock } from 'lucide-react';

export const TaskHistory: React.FC = () => {
    const { history, deleteTask, requestRestore } = useHistoryStore();

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const handleRestore = (task: SavedTask) => {
        if (confirm(`Restore task "${task.name}"? Current progress will be lost if not saved.`)) {
            requestRestore(task);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 text-gray-300">
            <div className="p-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                <History size={14} className="mr-2" />
                Task History
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {history.length === 0 ? (
                    <div className="text-center p-4 text-gray-600 italic text-xs">
                        No history yet. Start a new task to archive the current one.
                    </div>
                ) : (
                    history.map(task => (
                        <div key={task.id} className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded p-2 transition-all">
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-xs text-blue-300 line-clamp-2 w-full pr-4" title={task.name}>
                                    {task.name}
                                </span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity p-0.5"
                                    title="Delete from history"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                            
                            <div className="flex items-center space-x-3 text-[10px] text-gray-500 mb-2">
                                <span className="flex items-center">
                                    <Clock size={10} className="mr-1" />
                                    {formatDate(task.timestamp)}
                                </span>
                                <span className="flex items-center">
                                    <MessageSquare size={10} className="mr-1" />
                                    {task.messages.length}
                                </span>
                                <span className="flex items-center">
                                    <CheckSquare size={10} className="mr-1" />
                                    {task.tasks.length}
                                </span>
                            </div>

                            <button 
                                onClick={() => handleRestore(task)}
                                className="w-full py-1 bg-gray-700 hover:bg-blue-600/20 hover:text-blue-300 rounded text-[10px] flex items-center justify-center transition-colors"
                            >
                                <RotateCcw size={10} className="mr-1.5" />
                                Restore Session
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
