import React, { useEffect, useRef, useState } from 'react';
import { CHANNELS } from '../../../shared/constants';
import { AnsiRenderer } from './AnsiRenderer';

interface TerminalMessage {
    type: 'stdout' | 'stderr' | 'info';
    text: string;
    timestamp: number;
}

export const TerminalPanel: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [messages, setMessages] = useState<TerminalMessage[]>([]);
    const [activeCommand, setActiveCommand] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!window.electron) return;

        const onStart = (data: { command: string, cwd: string }) => {
            setIsVisible(true);
            setIsRunning(true);
            setActiveCommand(data.command);
            setMessages(prev => [
                ...prev, 
                { type: 'info', text: `> ${data.command}`, timestamp: Date.now() },
                { type: 'info', text: `  (cwd: ${data.cwd || 'root'})`, timestamp: Date.now() }
            ]);
            // Auto-focus the terminal for input
            setTimeout(() => containerRef.current?.focus(), 100);
        };

        const onOutput = (data: { type: 'stdout' | 'stderr', data: string }) => {
            setMessages(prev => [...prev, { type: data.type, text: data.data, timestamp: Date.now() }]);
        };

        const onStop = (data: { code: number }) => {
            setIsRunning(false);
            setMessages(prev => [...prev, { 
                type: data.code === 0 ? 'info' : 'stderr', 
                text: `\n[Process exited with code ${data.code}]`, 
                timestamp: Date.now() 
            }]);
        };
        
        const onKilled = () => {
             setIsRunning(false);
             setMessages(prev => [...prev, { type: 'stderr', text: '\n[Process Terminated by User]', timestamp: Date.now() }]);
        };

        const removeStart = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.TERMINAL.START, onStart);
        const removeOutput = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.TERMINAL.OUTPUT, onOutput);
        const removeStop = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.TERMINAL.STOP, onStop);
        const removeKilled = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.TERMINAL.KILLED, onKilled);

        return () => {
            removeStart();
            removeOutput();
            removeStop();
            removeKilled();
        };
    }, []);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isVisible]);

    const handleKill = () => {
        if (window.electron) {
            window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.KILL_PROCESS);
        }
    };

    const handleClear = () => {
        setMessages([]);
    };

    const handleClose = () => {
        setIsVisible(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isRunning) return;
        
        // Prevent default only for specific keys if needed, but usually we want to capture everything
        // For basic terminal emulation, just send the key.
        // Special handling for Enter?
        let key = e.key;
        if (key === 'Enter') key = '\n';
        if (key === 'Backspace') key = '\b';
        // Ignore modifier keys alone
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return;

        // If Ctrl+C, maybe handle locally or send special signal?
        // For now, let's just send the key char if possible.
        // Actually, just sending the key value is simplest for 'q', 'a', etc.
        
        if (window.electron) {
            window.electron.ipcRenderer.send(CHANNELS.TO_MAIN.TERMINAL_INPUT, { data: key });
        }
    };

    if (!isVisible && messages.length === 0) return null;

    return (
        <div 
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={`fixed bottom-0 left-80 right-96 bg-black border-t border-gray-700 transition-all duration-300 flex flex-col shadow-2xl z-50 outline-none ${isVisible ? 'h-64' : 'h-8'} ${isRunning ? 'focus:border-blue-500' : ''}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 h-8 bg-gray-800 border-b border-gray-700 select-none">
                <div 
                    className="flex items-center space-x-2 text-xs font-mono text-gray-400 cursor-pointer"
                    onClick={() => setIsVisible(!isVisible)}
                >
                    <span className={`transform transition-transform ${isVisible ? 'rotate-0' : '-rotate-90'}`}>▼</span>
                    <span>TERMINAL {activeCommand ? `— ${activeCommand}` : ''}</span>
                    {isRunning && <span className="animate-pulse text-green-500">●</span>}
                </div>
                <div className="flex items-center space-x-2">
                    {isRunning && (
                        <button 
                            onClick={handleKill}
                            className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 hover:bg-red-900 border border-red-800 rounded flex items-center"
                        >
                            <span className="mr-1">■</span> Stop
                        </button>
                    )}
                    <button onClick={handleClear} className="text-gray-500 hover:text-white px-2" title="Clear Output">
                        ∅
                    </button>
                    <button onClick={handleClose} className="text-gray-500 hover:text-white px-2" title="Close Panel">
                        ×
                    </button>
                </div>
            </div>

            {/* Content */}
            {isVisible && (
                <div className="flex-1 overflow-auto p-2 font-mono text-xs text-gray-300 whitespace-pre-wrap">
                    {messages.map((msg, idx) => (
                        <span key={idx} className={
                            msg.type === 'stderr' ? 'text-red-400' : 
                            msg.type === 'info' ? 'text-blue-400 font-bold' : 
                            'text-gray-300'
                        }>
                            <AnsiRenderer text={msg.text} />
                        </span>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )}
        </div>
    );
};
