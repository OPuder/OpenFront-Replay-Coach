const AUTO_UPDATE_KEY = 'openfront.update-center.auto-check.v1';
const LAST_SUCCESSFUL_CHECK_KEY = 'openfront.update-center.last-successful-check.v1';

export interface UpdatePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(storage?: UpdatePreferenceStorage): UpdatePreferenceStorage | null {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

export function readAutoUpdateEnabled(storage?: UpdatePreferenceStorage): boolean {
  try {
    const value = getStorage(storage)?.getItem(AUTO_UPDATE_KEY);
    return value === null || value === undefined ? true : value === 'true';
  } catch { return true; }
}

export function writeAutoUpdateEnabled(enabled: boolean, storage?: UpdatePreferenceStorage): boolean {
  try {
    const target = getStorage(storage);
    if (!target) return false;
    target.setItem(AUTO_UPDATE_KEY, String(enabled));
    return true;
  } catch { return false; }
}

export function readLastSuccessfulUpdateCheck(storage?: UpdatePreferenceStorage): string | null {
  try {
    const value = getStorage(storage)?.getItem(LAST_SUCCESSFUL_CHECK_KEY);
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return value;
  } catch { return null; }
}

export function writeLastSuccessfulUpdateCheck(checkedAt: Date, storage?: UpdatePreferenceStorage): boolean {
  if (!Number.isFinite(checkedAt.getTime())) return false;
  try {
    const target = getStorage(storage);
    if (!target) return false;
    target.setItem(LAST_SUCCESSFUL_CHECK_KEY, checkedAt.toISOString());
    return true;
  } catch { return false; }
}
