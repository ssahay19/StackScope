import { InvalidRepoUrlError } from './errors.js';

/**
 * Strict GitHub URL parser.
 *
 * Accepts only:
 *   https://github.com/<owner>/<repo>
 *   https://github.com/<owner>/<repo>/
 *   https://github.com/<owner>/<repo>.git
 *
 * Rejects SSH, non-HTTPS, non-github.com hosts, and any URL containing
 * extra path segments (issues, tree, pull, etc). This gives us a small,
 * predictable attack surface for Phase 1.
 */

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
  cloneUrl: string;
}

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export const parseGithubRepoUrl = (input: unknown): ParsedGithubRepo => {
  if (typeof input !== 'string') {
    throw new InvalidRepoUrlError('Repository URL is required.');
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new InvalidRepoUrlError('Repository URL is required.');
  }
  if (trimmed.length > 300) {
    throw new InvalidRepoUrlError('Repository URL is too long.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidRepoUrlError('Repository URL is malformed.');
  }

  if (url.protocol !== 'https:') {
    throw new InvalidRepoUrlError('Only https:// GitHub URLs are supported.');
  }
  if (url.hostname !== 'github.com') {
    throw new InvalidRepoUrlError('Only github.com URLs are supported.');
  }
  if (url.username || url.password) {
    throw new InvalidRepoUrlError('URLs with embedded credentials are not allowed.');
  }
  if (url.search || url.hash) {
    throw new InvalidRepoUrlError('URLs with query strings or fragments are not allowed.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new InvalidRepoUrlError(
      'URL must be in the form https://github.com/<owner>/<repository>.',
    );
  }

  const [ownerRaw, repoRaw] = segments as [string, string];
  const owner = ownerRaw;
  let repo = repoRaw;
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  if (!OWNER_PATTERN.test(owner)) {
    throw new InvalidRepoUrlError('Invalid GitHub owner in URL.');
  }
  if (!REPO_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw new InvalidRepoUrlError('Invalid repository name in URL.');
  }

  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  return { owner, repo, cloneUrl };
};
