import { contextBridge, ipcRenderer } from 'electron';
import { createEnterpriseBrainBridge } from '../shared/enterprise-brain.js';

contextBridge.exposeInMainWorld(
  'enterpriseBrain',
  createEnterpriseBrainBridge(
    (channel, payload) => ipcRenderer.invoke(channel, payload),
    (listener) => {
      const handler = () => listener();
      ipcRenderer.on('auth:lost', handler);
      return () => ipcRenderer.removeListener('auth:lost', handler);
    }
  )
);
