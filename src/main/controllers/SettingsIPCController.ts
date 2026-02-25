import { ipcMain, app } from 'electron';
import path from 'path';
import * as fs from 'fs-extra';
import { SettingsService } from '../services/SettingsService';
import { WorkflowService } from '../services/WorkflowService';
import { FileSystemService } from '../services/FileSystem';
import { CHANNELS } from '../../shared/constants';

export class SettingsIPCController {
    constructor(
        private settingsService: SettingsService,
        private workflowService: WorkflowService,
        private fileSystemService: FileSystemService
    ) {
        this.registerHandlers();
    }

    private registerHandlers() {
        ipcMain.handle(CHANNELS.TO_MAIN.GET_SETTINGS, async () => {
            return await this.settingsService.getSettings();
        });

        ipcMain.handle(CHANNELS.TO_MAIN.SAVE_SETTINGS, async (_, newSettings) => {
            return await this.settingsService.saveSettings(newSettings);
        });

        ipcMain.handle(CHANNELS.TO_MAIN.GET_INSTRUCTIONS, async () => {
            const userDataPath = app.getPath('userData');
            const globalPath = path.join(userDataPath, 'global_instructions.md');
            
            let globalContent = "";
            if (await fs.pathExists(globalPath)) {
                globalContent = await fs.readFile(globalPath, 'utf-8');
            }

            let projectContent = "";
            const projectRoot = this.fileSystemService.getProjectRoot();
            if (projectRoot) {
                const projectPath = path.join(projectRoot, '.gemini', 'instructions.md');
                if (await fs.pathExists(projectPath)) {
                    projectContent = await fs.readFile(projectPath, 'utf-8');
                }
            }

            return { global: globalContent, project: projectContent };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.SAVE_INSTRUCTIONS, async (_, { type, content }) => {
            let targetPath = "";
            if (type === 'global') {
                const userDataPath = app.getPath('userData');
                targetPath = path.join(userDataPath, 'global_instructions.md');
            } else {
                const projectRoot = this.fileSystemService.getProjectRoot();
                if (!projectRoot) throw new Error("No project open");
                targetPath = path.join(projectRoot, '.gemini', 'instructions.md');
            }

            await fs.ensureDir(path.dirname(targetPath));
            await fs.writeFile(targetPath, content, 'utf-8');
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.GET_CHECKLIST, async () => {
            const projectRoot = this.fileSystemService.getProjectRoot();
            if (!projectRoot) return "";
            
            const checklistPath = path.join(projectRoot, '.gemini', 'checklist.md');
            if (await fs.pathExists(checklistPath)) {
                return await fs.readFile(checklistPath, 'utf-8');
            }
            return "";
        });

        ipcMain.handle(CHANNELS.TO_MAIN.SAVE_CHECKLIST, async (_, content) => {
            const projectRoot = this.fileSystemService.getProjectRoot();
            if (!projectRoot) throw new Error("No project open");
            
            const checklistPath = path.join(projectRoot, '.gemini', 'checklist.md');
            await fs.ensureDir(path.dirname(checklistPath));
            await fs.writeFile(checklistPath, content, 'utf-8');
            return { success: true };
        });

        // Workflow Handlers
        ipcMain.handle(CHANNELS.TO_MAIN.GET_WORKFLOW, async () => {
            return await this.workflowService.loadWorkflow();
        });

        ipcMain.handle(CHANNELS.TO_MAIN.SAVE_WORKFLOW, async (_, workflow) => {
            await this.workflowService.saveWorkflow(workflow);
            return { success: true };
        });

        ipcMain.handle(CHANNELS.TO_MAIN.RESET_WORKFLOW, async () => {
            this.workflowService.resetToDefault();
            return this.workflowService.getCurrentWorkflow();
        });

        ipcMain.handle(CHANNELS.TO_MAIN.UNDO_WORKFLOW, async () => {
            return this.workflowService.undo();
        });

        ipcMain.handle(CHANNELS.TO_MAIN.REDO_WORKFLOW, async () => {
            return this.workflowService.redo();
        });
    }
}
