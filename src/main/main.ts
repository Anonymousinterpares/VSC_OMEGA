import { app, BrowserWindow } from 'electron';
import path from 'path';
import { FileSystemService } from './services/FileSystem';
import { SettingsService } from './services/SettingsService';
import { LLMService } from './services/LLMService';
import { SyntaxService } from './services/SyntaxService';
import { CHANNELS } from '../shared/constants';

import { AgentOrchestrator } from './agents/AgentOrchestrator';
import { ProposalManager } from './services/ProposalManager';
import { WorkflowService } from './services/WorkflowService';

// Controllers
import { FileIPCController } from './controllers/FileIPCController';
import { AgentIPCController } from './controllers/AgentIPCController';
import { SettingsIPCController } from './controllers/SettingsIPCController';
import { AssetIPCController } from './controllers/AssetIPCController';

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
    const port = process.env.VITE_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${port}`);
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
  new SyntaxService(); 
  llmService = new LLMService(settingsService);
  proposalManager = new ProposalManager(mainWindow);
  workflowService = new WorkflowService(process.cwd()); 
  orchestrator = new AgentOrchestrator(llmService, fileSystemService, workflowService, settingsService, mainWindow, proposalManager);

  // Initialize IPC Controllers (Self-registering)
  new FileIPCController(fileSystemService, mainWindow);
  new AgentIPCController(orchestrator, proposalManager);
  new SettingsIPCController(settingsService, workflowService, fileSystemService);
  new AssetIPCController();

  // Handle App Closing (Dirty Check Trigger)
  let isQuitting = false;
  mainWindow.on('close', (e) => {
      if (isQuitting) return;

      e.preventDefault();
      // Send request to renderer to check for dirty files
      mainWindow?.webContents.send(CHANNELS.TO_RENDERER.DIRTY_CHECK_REQUEST);
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
