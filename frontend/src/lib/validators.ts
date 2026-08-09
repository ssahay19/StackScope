/**
 * Client-side URL validation.
 *
 * Intentionally more permissive than the backend — we let the backend be the
 * final authority. The client's job is only to catch obvious problems before
 * a network round-trip and to give inline feedback.
 */

const GITHUB_URL_PATTERN =
  /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9._-]{1,100}(?:\.git)?\/?$/;

export const isValidGithubUrl = (input: string): boolean => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 300) return false;
  return GITHUB_URL_PATTERN.test(trimmed);
};

export const describeInvalidUrl = (input: string): string | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('git@') || trimmed.startsWith('ssh://')) {
    return 'SSH URLs are not supported. Use the https:// GitHub URL.';
  }
  if (!trimmed.startsWith('https://')) {
    return 'URL must start with https://';
  }
  if (!trimmed.includes('github.com/')) {
    return 'Only github.com repositories are supported.';
  }
  if (!isValidGithubUrl(trimmed)) {
    return 'Use the form https://github.com/<owner>/<repository>';
  }
  return null;
};
