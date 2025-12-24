import { app } from 'electron';
import path from 'path';
import { JSONFilePreset } from 'lowdb/node';
import { IAppSettings } from '../../shared/types';

interface Data {
  settings: IAppSettings;
}

const defaultData: Data = {
  settings: {
    geminiApiKey: '',
    selectedModel: 'gemini-3-flash-preview',
    agenticMode: 'agentic',
    googleSearchApiKey: '',
    googleSearchCx: ''
  }
};

export class SettingsService {
  private db: any;

  constructor() {
    this.init();
  }

  private async init() {
    const dbPath = path.join(app.getPath('userData'), 'hive_settings.json');
    this.db = await JSONFilePreset<Data>(dbPath, defaultData);
  }

  async getSettings(): Promise<IAppSettings> {
    await this.db.read();
    return this.db.data.settings;
  }

  async saveSettings(newSettings: Partial<IAppSettings>): Promise<IAppSettings> {
    await this.db.read();
    this.db.data.settings = { ...this.db.data.settings, ...newSettings };
    await this.db.write();
    return this.db.data.settings;
  }
}
