// Accept only local application paths, including translated pages. Never return
// to authentication endpoints (which could start another sign-in loop).
export function safeAuthReturn(value: string | null, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    const path = decodeURIComponent(url.pathname).replace(/^\/(zh-Hant|zh-Hans)(?=\/|$)/, '') || '/';
    if (url.origin !== 'https://local.invalid' || path.startsWith('//') || /[\\\u0000-\u0020]/.test(path) || /^\/(?:signin(?:-with-chatgpt)?|api)(?:\/|$)/.test(path)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function socialSignInError(code: string | null) {
  if (!code) return '';
  if (code === 'account_not_linked') return 'This email already has an account. Sign in using your existing password.';
  if (code === 'access_denied') return 'Google sign-in was cancelled. You can try again or continue as a guest.';
  return 'Google sign-in could not be completed. Please try again or use your email and password.';
}
