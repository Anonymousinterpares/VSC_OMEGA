import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { FileSystemService } from './services/FileSystem';
import { SettingsService } from './services/SettingsService';
import { LLMService } from './services/LLMService';
import { SyntaxService } from './services/SyntaxService';
import { CHANNELS } from '../shared/constants';

import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { ProposalManager } from './services/ProposalManager';
import { WorkflowService } from './services/WorkflowService';

let mainWindow: BrowserWindow | null = null;
let fileSystemService: FileSystemService;
let settingsService: SettingsService;
let llmService: LLMService;
let proposalManager: ProposalManager;
let orchestrator: AgentOrchestrator;
let workflowService: WorkflowService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
}

function loadApp() {
  if (!mainWindow) return;
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  if (!mainWindow) return;

  // Initialize Services
  settingsService = new SettingsService();
  fileSystemService = new FileSystemService(mainWindow);
  new SyntaxService(); // Self-registering IPC handlers
  llmService = new LLMService(settingsService);
  proposalManager = new ProposalManager(mainWindow);
  workflowService = new WorkflowService(process.cwd()); // Use CWD for workflow.json
  orchestrator = new AgentOrchestrator(llmService, fileSystemService, workflowService, settingsService, mainWindow, proposalManager);

  // IPC Handlers
  ipcMain.on(CHANNELS.TO_MAIN.OPEN_FOLDER, () => fileSystemService.handleOpenFolder());
  
  ipcMain.handle(CHANNELS.TO_MAIN.READ_FILE, async (_, filePath) => {
    return await fileSystemService.handleReadFile(filePath);
  });
  
  ipcMain.handle(CHANNELS.TO_MAIN.WRITE_FILE, async (_, { filePath, content }) => {
    return await fileSystemService.handleWriteFile(filePath, content);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.SEARCH_IN_FILES, async (_, options) => {
    return await fileSystemService.handleSearch(options);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.REPLACE_IN_FILES, async (_, { options, replaceText }) => {
    return await fileSystemService.handleReplace(options, replaceText);
  });

  ipcMain.on(CHANNELS.TO_MAIN.BACKUP_FILE, async (_, { filePath, content }) => {
      await fileSystemService.handleBackupFile(filePath, content);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.GET_BACKUPS, async () => {
      return await fileSystemService.getBackups();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.RESTORE_BACKUP, async (_, filePath) => {
      return await fileSystemService.handleRestoreBackup(filePath);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.GET_SETTINGS, async () => {
    return await settingsService.getSettings();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.SAVE_SETTINGS, async (_, newSettings) => {
    return await settingsService.saveSettings(newSettings);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.SEND_MESSAGE, async (_, { agent, message, context, history }) => {
      // Route through Orchestrator
      return await orchestrator.handleMessage({ agent, message, context, history });
  });

  ipcMain.handle(CHANNELS.TO_MAIN.ABORT_WORKFLOW, async () => {
      orchestrator.stop();
      return { success: true };
  });

  ipcMain.handle(CHANNELS.TO_MAIN.COMPRESS_CONTEXT, async (_, messages) => {
      return await orchestrator.compressHistory(messages);
  });

  ipcMain.handle(CHANNELS.TO_MAIN.RESET_SESSION, async () => {
      orchestrator.reset();
      return { success: true };
  });

  // Handle Review Decisions from UI
  ipcMain.handle(CHANNELS.TO_MAIN.REVIEW_DECISION, async (_, { id, status, content }) => {
      proposalManager.resolveProposal(id, status, content);
      return { success: true };
  });

  ipcMain.handle(CHANNELS.TO_MAIN.TASK_CONFIRMATION_DECISION, async (_, { id, status, comment }) => {
      proposalManager.resolveTaskConfirmation(id, status, comment);
      return { success: true };
  });

  // Workflow Handlers
  ipcMain.handle(CHANNELS.TO_MAIN.GET_WORKFLOW, async () => {
      return await workflowService.loadWorkflow();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.SAVE_WORKFLOW, async (_, workflow) => {
      await workflowService.saveWorkflow(workflow);
      return { success: true };
  });

  ipcMain.handle(CHANNELS.TO_MAIN.RESET_WORKFLOW, async () => {
      workflowService.resetToDefault();
      return workflowService.getCurrentWorkflow();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.UNDO_WORKFLOW, async () => {
      return workflowService.undo();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.REDO_WORKFLOW, async () => {
      return workflowService.redo();
  });

  ipcMain.handle(CHANNELS.TO_MAIN.PAUSE_WORKFLOW, async () => {
      orchestrator.pause();
      return { success: true };
  });

  ipcMain.handle(CHANNELS.TO_MAIN.RESUME_WORKFLOW, async () => {
      orchestrator.resume();
      return { success: true };
  });

  // Terminal Handlers
  ipcMain.on(CHANNELS.TO_MAIN.KILL_PROCESS, () => {
      orchestrator.killActiveProcess();
  });

  // Handle App Closing
  let isQuitting = false;
  mainWindow.on('close', (e) => {
      if (isQuitting) return;

      e.preventDefault();
      
      // Send request to renderer to check for dirty files
      mainWindow?.webContents.send(CHANNELS.TO_RENDERER.DIRTY_CHECK_REQUEST);
  });

  // Handle response from Renderer regarding dirty state
  ipcMain.on(CHANNELS.TO_MAIN.CHECK_DIRTY, async (_, { isDirty, unsavedCount }) => {
      if (isDirty) {
          const response = await dialog.showMessageBox(mainWindow!, {
              type: 'warning',
              buttons: ['Save All & Exit', 'Exit without Saving', 'Cancel'],
              defaultId: 0,
              cancelId: 2,
              title: 'Unsaved Changes',
              message: `You have ${unsavedCount} unsaved file(s).`,
              detail: 'Do you want to save your changes before exiting?'
          });

          if (response.response === 0) {
              await fileSystemService.commitBackupsToFiles();
              isQuitting = true;
              app.quit();

          } else if (response.response === 1) {
              // Exit without Saving
              isQuitting = true;
              app.quit();
          } 
          // Case 2: Cancel - do nothing, stay open
      } else {
          isQuitting = true;
          app.quit();
      }
  });

  // LOAD APP CONTENT NOW - AFTER ALL HANDLERS ARE REGISTERED
  loadApp();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        loadApp();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});