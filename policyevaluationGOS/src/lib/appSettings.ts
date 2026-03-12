const GEMINI_API_KEY_STORAGE_KEY = 'policyevgos.geminiApiKey';

export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (value.trim()) {
      window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, value.trim());
      return;
    }

    window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep app usable.
  }
}

export function maskGeminiApiKey(value: string): string {
  if (!value) {
    return '未設定';
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}
