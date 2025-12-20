import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { FileSystemService } from './services/FileSystem';
import { SettingsService } from './services/SettingsService';
import { LLMService } from './services/LLMService';
import { SyntaxService } from './services/SyntaxService';
import { CHANNELS } from '../shared/constants';

import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { ProposalManager } from './services/ProposalManager';

let mainWindow: BrowserWindow | null = null;
let fileSystemService: FileSystemService;
let settingsService: SettingsService;
let llmService: LLMService;
let proposalManager: ProposalManager;
let orchestrator: AgentOrchestrator;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
  orchestrator = new AgentOrchestrator(llmService, fileSystemService, mainWindow, proposalManager);

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

  ipcMain.handle(CHANNELS.TO_MAIN.SEND_MESSAGE, async (_, { agent, message, context }) => {
      // Route through Orchestrator
      return await orchestrator.handleMessage({ agent, message, context });
  });

  ipcMain.handle(CHANNELS.TO_MAIN.ABORT_WORKFLOW, async () => {
      orchestrator.stop();
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
              // Save All & Exit - Tell renderer to save all
              // We need a channel for this, or we can just ask user to save manually.
              // For true robustness: Renderer should have a 'saveAll' method invoked via IPC or we assume user did it.
              // Simplification for this step: We trust the Backup system for "Exit without Saving" scenario,
              // but for "Save & Exit" we ideally want to commit to disk.
              // Let's ask renderer to save all and then quit.
              
              // However, since we are in the main process, we can't easily trigger the renderer's save logic synchronously 
              // AND wait for it before quitting in this callback structure without complex event chaining.
              
              // Strategy: Just let the user know they need to save, OR (better) implement SAVE_ALL channel.
              // Given the complexity:
              // For now, if they click "Save All", we will effectively "Cancel" the close and tell them to save.
              // OR better: we accept the "Exit without Saving" because we HAVE BACKUPS.
              
              // Refined Logic for "Save All":
              // We can't easily reach into React state to get content to write.
              // So "Save All" is tricky from here without a prior 'push' of content.
              // But wait! We DO have the backups! We can commit the backups to real files!
              
              await fileSystemService.commitBackupsToFiles();
              isQuitting = true;
              app.quit();

          } else if (response.response === 1) {
              // Exit without Saving (Backups might persist or be cleared depending on policy, currently they persist until explicit save)
              isQuitting = true;
              app.quit();
          } 
          // Case 2: Cancel - do nothing, stay open
      } else {
          isQuitting = true;
          app.quit();
      }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});