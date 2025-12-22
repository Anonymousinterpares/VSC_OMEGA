import React, { useMemo } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import clsx from 'clsx';
import { IAgentDefinition } from '../../../shared/workflowTypes';

const CENTER_X = 400;
const CENTER_Y = 300;
const RADIUS = 200;

export const NodeGraph: React.FC = () => {
  const { workflow, selectedAgentId, selectAgent } = useWorkflowStore();
  const { status, pausedContext } = useExecutionStore();

  const agents = workflow?.agents || [];
  const routerNode = { id: 'Router', name: 'Router', color: '#6366f1' }; // Indigo
  const pausedAgentId = status === 'PAUSED' ? pausedContext?.agent : null;

  const nodes = useMemo(() => {
    return agents.map((agent, index) => {
      const angle = (index / agents.length) * 2 * Math.PI - Math.PI / 2; // Start from top
      return {
        ...agent,
        x: CENTER_X + RADIUS * Math.cos(angle),
        y: CENTER_Y + RADIUS * Math.sin(angle)
      };
    });
  }, [agents]);

  if (!workflow) return <div className="text-gray-500">Loading Workflow...</div>;

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden select-none">
      {/* SVG Layer for Connections */}
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
            </marker>
        </defs>
        {nodes.map(node => (
          <g key={`conn-${node.id}`}>
             {/* Line from Router to Agent (Output) */}
             <line 
                x1={CENTER_X} y1={CENTER_Y} 
                x2={node.x} y2={node.y} 
                stroke="#475569" 
                strokeWidth="2"
                strokeDasharray="5,5"
                markerEnd="url(#arrowhead)"
             />
          </g>
        ))}
      </svg>

      {/* Router Node (Center) */}
      <div 
        className={clsx(
            "absolute flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 shadow-xl cursor-pointer transition-transform hover:scale-105 z-10",
            selectedAgentId === 'Router' ? "border-white scale-110 shadow-indigo-500/50" : "border-indigo-500/50",
            pausedAgentId === 'Router' && "ring-4 ring-amber-500 animate-pulse"
        )}
        style={{ 
            top: CENTER_Y - 64, 
            left: CENTER_X - 64, 
            backgroundColor: '#1e1b4b' 
        }}
        onClick={() => selectAgent('Router')}
      >
        <div className="text-white font-bold text-lg">ROUTER</div>
        <div className="text-indigo-300 text-xs mt-1">Orchestrator</div>
      </div>

      {/* Agent Nodes */}
      {nodes.map(node => (
        <div
          key={node.id}
          className={clsx(
            "absolute flex flex-col items-center justify-center w-24 h-24 rounded-xl border-2 shadow-lg cursor-pointer transition-all hover:scale-105 hover:z-20",
            selectedAgentId === node.id ? "border-white scale-110 shadow-white/20" : "border-transparent",
            pausedAgentId === node.id && "ring-4 ring-amber-500 animate-pulse"
          )}
          style={{
            top: node.y - 48,
            left: node.x - 48,
            backgroundColor: node.color + '20', // Low opacity fill
            borderColor: selectedAgentId === node.id ? 'white' : node.color
          }}
          onClick={() => selectAgent(node.id)}
        >
          <div className="font-bold text-sm text-center px-1" style={{ color: node.color }}>{node.name}</div>
          <div className="text-gray-400 text-[10px] mt-1 text-center truncate w-full px-2">{node.role}</div>
        </div>
      ))}
      
      <div className="absolute bottom-4 right-4 text-xs text-slate-500">
        Interactive Graph: Click nodes to edit logic
      </div>
    </div>
  );
};
