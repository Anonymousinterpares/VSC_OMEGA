import { BrowserWindow } from 'electron';
import { CHANNELS } from '../../shared/constants';

export interface IProposal {
    id: string;
    type: 'new' | 'edit';
    path: string;
    original: string;
    modified: string;
}

interface IPendingProposal {
    resolve: (value: { status: 'accepted' | 'rejected', content?: string }) => void;
    reject: (reason?: any) => void;
}

interface IPendingTask {
    resolve: (value: { status: 'confirmed' | 'rejected', comment?: string }) => void;
}

export class ProposalManager {
    private mainWindow: BrowserWindow | null;
    private pendingProposals: Map<string, IPendingProposal> = new Map();
    private pendingTasks: Map<string, IPendingTask> = new Map();

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }

    public setWindow(window: BrowserWindow) {
        this.mainWindow = window;
    }

    async requestApproval(proposal: IProposal): Promise<{ status: 'accepted' | 'rejected', content?: string }> {
        if (!this.mainWindow) {
            throw new Error("UI Window not available for review.");
        }

        // Send to UI
        this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.PROPOSE_CHANGE, proposal);

        // Wait for User Decision
        return new Promise((resolve, reject) => {
            this.pendingProposals.set(proposal.id, { resolve, reject });
        });
    }

    resolveProposal(id: string, status: 'accepted' | 'rejected', content?: string) {
        const pending = this.pendingProposals.get(id);
        if (pending) {
            pending.resolve({ status, content });
            this.pendingProposals.delete(id);
        } else {
            console.warn(`Attempted to resolve unknown proposal: ${id}`);
        }
    }

    async requestTaskConfirmation(taskDescription: string): Promise<{ status: 'confirmed' | 'rejected', comment?: string }> {
        if (!this.mainWindow) {
            throw new Error("UI Window not available for task verification.");
        }

        const id = Date.now().toString();
        this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.REQUEST_TASK_CONFIRMATION, { id, description: taskDescription });

        return new Promise((resolve) => {
            this.pendingTasks.set(id, { resolve });
        });
    }

    resolveTaskConfirmation(id: string, status: 'confirmed' | 'rejected', comment?: string) {
        const pending = this.pendingTasks.get(id);
        if (pending) {
            pending.resolve({ status, comment });
            this.pendingTasks.delete(id);
        }
    }
}
