import { contextBridge, ipcRenderer } from 'electron';
import { createEnterpriseBrainBridge } from '../shared/enterprise-brain.js';

contextBridge.exposeInMainWorld(
  'enterpriseBrain',
  createEnterpriseBrainBridge((channel, payload) =>
    ipcRenderer.invoke(channel, payload)
  )
);
