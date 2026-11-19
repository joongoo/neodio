const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(tag) {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`Invalid stable release tag: ${tag}`);
  return match.slice(1).map(BigInt);
}

function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) { if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1; }
  return 0;
}

function validateRelease(pr, tags, allowExisting = false) {
  if (pr.base.ref !== 'main' || !(pr.head.ref === 'staging' || pr.head.ref.startsWith('hotfix/'))) throw new Error('Release PR must target main from staging or hotfix/*.');
  if (pr.head.repo?.full_name !== pr.base.repo?.full_name) throw new Error('Release branches must be in this repository.');
  const match = /^release: (v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(pr.title);
  if (!match) throw new Error('Release PR title must be exactly: release: vX.Y.Z');
  const tag = match[1];
  for (const existing of tags.filter(value => TAG.test(value))) {
    const comparison = compareVersions(tag, existing);
    if (comparison < 0 || (comparison === 0 && !allowExisting)) throw new Error(`Release version must be newer than ${existing}.`);
  }
  return tag;
}

module.exports = { compareVersions, validateRelease };
