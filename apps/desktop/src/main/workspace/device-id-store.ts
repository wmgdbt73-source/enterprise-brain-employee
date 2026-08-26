import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { asDeviceId, type DeviceId } from '@enterprise-brain/domain';
import { readJsonFile, writeJsonAtomically } from './json-file.js';

interface DeviceIdFile {
  version: 1;
  deviceId: string;
}

export class DeviceIdStore {
  private readonly filePath: string;
  constructor(directory: string) {
    this.filePath = path.join(directory, 'device-id.json');
  }
  async get(): Promise<DeviceId> {
    const stored = await readJsonFile<DeviceIdFile>(this.filePath);
    if (!stored) {
      const deviceId = asDeviceId(randomUUID());
      await writeJsonAtomically(this.filePath, { version: 1, deviceId });
      return deviceId;
    }
    if (
      stored.version !== 1 ||
      typeof stored.deviceId !== 'string' ||
      !isUuid(stored.deviceId)
    ) {
      throw new Error('Device identity metadata is invalid');
    }
    return asDeviceId(stored.deviceId);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
