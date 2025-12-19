import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { FileSystemService } from './services/FileSystem';
import { SettingsService } from './services/SettingsService';
import { LLMService } from './services/LLMService';
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

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});