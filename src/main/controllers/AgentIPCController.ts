import { ipcMain } from 'electron';
import { AgentOrchestrator } from '../agents/AgentOrchestrator';
import { ProposalManager } from '../services/ProposalManager';
import { CHANNELS } from '../../shared/constants';

export class AgentIPCController {
    constructor(
        private orchestrator: AgentOrchestrator,
        private proposalManager: ProposalManager
    ) {
        this.registerHandlers();
    }

    private registerHandlers() {
        ipcMain.handle(CHANNELS.TO_MAIN.SEND_MESSAGE, async (_, { agent, message, context, history }) => {
            return await this.orchestrator.handleMessage({ agent, message, context, history });
        });

        ipcMain.handle(CHANNELS.TO_MAIN.ABORT_WORKFLOW, async () => {
            this.orchestrator.stop();
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.COMPRESS_CONTEXT, async (_, messages) => {
            return await this.orchestrator.compressHistory(messages);
        });

        ipcMain.handle(CHANNELS.TO_MAIN.RESET_SESSION, async () => {
            this.orchestrator.reset();
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.PAUSE_WORKFLOW, async () => {
            this.orchestrator.pause();
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.RESUME_WORKFLOW, async () => {
            this.orchestrator.resume();
            return { success: true };
        });

        // Handle Review Decisions from UI
        ipcMain.handle(CHANNELS.TO_MAIN.REVIEW_DECISION, async (_, { id, status, content }) => {
            this.proposalManager.resolveProposal(id, status, content);
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.TASK_CONFIRMATION_DECISION, async (_, { id, status, comment }) => {
            this.proposalManager.resolveTaskConfirmation(id, status, comment);
            return { success: true };
        });

        // Terminal Handlers
        ipcMain.on(CHANNELS.TO_MAIN.KILL_PROCESS, () => {
            this.orchestrator.killActiveProcess();
        });

        ipcMain.on(CHANNELS.TO_MAIN.TERMINAL_INPUT, (_, { data }) => {
            this.orchestrator.writeToProcess(data);
        });
    }
}
