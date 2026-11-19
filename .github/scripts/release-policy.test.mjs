import test from 'node:test';
import assert from 'node:assert/strict';
import policy from './release-policy.cjs';
const { compareVersions, validateRelease } = policy;
const pr = (title = 'release: v0.2.0', branch = 'staging') => ({ title, base: { ref: 'main', repo: { full_name: 'org/repo' } }, head: { ref: branch, repo: { full_name: 'org/repo' } } });

test('release versions sort numerically, reject reused and lower versions, allow retry only explicitly', () => {
  assert.equal(compareVersions('v1.10.0', 'v1.9.0'), 1);
  assert.equal(validateRelease(pr(), ['v0.1.0']), 'v0.2.0');
  assert.throws(() => validateRelease(pr(), ['v0.2.0']));
  assert.equal(validateRelease(pr(), ['v0.2.0'], true), 'v0.2.0');
  assert.throws(() => validateRelease(pr(), ['v0.3.0'], true));
  assert.equal(validateRelease(pr('release: v0.1.1', 'hotfix/urgent'), ['v0.1.0']), 'v0.1.1');
});

test('ordinary feature PRs, forks, malformed versions and title payloads are rejected', () => {
  assert.throws(() => validateRelease(pr('release: v0.2.0', 'feature/test'), []));
  for (const title of ['release: v01.2.0', 'release: v1.0.0-rc.1', 'release: v1.2', 'release: v1.2.3; echo bad']) assert.throws(() => validateRelease(pr(title), []));
  const fork = pr(); fork.head.repo.full_name = 'other/repo';
  assert.throws(() => validateRelease(fork, []));
});
