import React from 'react';
import { useTaskStore, ITask } from '../../store/useTaskStore';

const StatusIcon = ({ status }: { status: ITask['status'] }) => {
  switch (status) {
    case 'pending': return <span className="text-gray-500">⏳</span>;
    case 'in_progress': return <span className="text-blue-400 animate-pulse">🔨</span>;
    case 'review_pending': return <span className="text-yellow-400">🕵️</span>;
    case 'completed': return <span className="text-green-500">✅</span>;
    case 'failed': return <span className="text-red-500">❌</span>;
    default: return <span>•</span>;
  }
};

export const MissionStatus: React.FC = () => {
  const { tasks, strictMode } = useTaskStore();

  if (tasks.length === 0) return null;

  const progress = Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100);

  return (
    <div className="border-t border-gray-700 bg-[#1e1e1e] p-3 flex flex-col gap-2 shadow-lg">
      <div className="flex justify-between items-center text-xs text-gray-400 uppercase tracking-wider font-bold">
        <span>Mission Status</span>
        <span>{progress}% Complete</span>
      </div>

      <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-h-32 overflow-y-auto space-y-1 mt-1 pr-1 custom-scrollbar">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 text-sm p-1 hover:bg-[#2d2d2d] rounded">
            <StatusIcon status={task.status} />
            <span className={`flex-1 truncate ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
              <span className="font-bold mr-1">{task.id}:</span> {task.description}
            </span>
            {task.status === 'review_pending' && (
               <span className="text-[10px] bg-yellow-900 text-yellow-200 px-1 rounded border border-yellow-700">
                 Reviewing
               </span>
            )}
            {task.status === 'in_progress' && task.assignedAgent && (
                <span className="text-[10px] bg-blue-900 text-blue-200 px-1 rounded border border-blue-700">
                    {task.assignedAgent}
                </span>
            )}
          </div>
        ))}
      </div>
      
      {strictMode && (
          <div className="text-[10px] text-yellow-500 text-center border-t border-gray-700 pt-1">
              ⚠️ Strict Mode: Manual Approval Required
          </div>
      )}
    </div>
  );
};
