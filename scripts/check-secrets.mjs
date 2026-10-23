// Read-only pre-publication check. Never print matching secret values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
const patterns = [
  ['API token', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g],
  ['Google API token', /AIza[\w-]{30,}/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const findings = [];
const knownSecrets = new Set();
// Read only local environment files to compare values; neither names nor values are logged.
for (const dir of ['', 'server', 'client']) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!/^\.env(?:\..+)?$/.test(name) || name.endsWith('.example')) continue;
    const filename = path.join(root, dir, name);
    if (!fs.statSync(filename).isFile()) continue;
    for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([\w]+)\s*=\s*(.*?)\s*$/);
      if (!match || !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(match[1])) continue;
      const value = match[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
      if (value.length >= 8) knownSecrets.add(value);
    }
  }
}
function scan(name, buffer) {
  const filename = name.replace(/^(?:working|index|history:[^:]+):/, '');
  if (/(?:^|\/)\.env(?:\..+)?$/.test(filename) && !filename.endsWith('.example')) {
    findings.push({ file: name, type: 'Environment file must not be published' });
  }
  if (/(?:^|\/)(?:credentials[^/]*|service[-_]account[^/]*)\.json$|\.(?:pem|key|p12|pfx)$/i.test(filename)) {
    findings.push({ file: name, type: 'Credential file requires review' });
  }
  if (buffer.includes(0)) return; // Binary assets require separate manual review.
  const text = buffer.toString('utf8');
  for (const [type, regex] of patterns) {
    for (const match of text.matchAll(regex)) {
      // Existing tests use explicit, non-operational mock credentials.
      if (/(?:^|\/)tests\//.test(filename) && /(?:test|fake|example|placeholder|dummy|mock)/i.test(match[0])) continue;
      findings.push({ file: name, line: text.slice(0, match.index).split('\n').length, type });
    }
  }
  for (const value of knownSecrets) {
    const index = text.indexOf(value);
    if (index >= 0) findings.push({ file: name, line: text.slice(0, index).split('\n').length, type: 'Matches a local credential' });
  }
}
try {
  const workingPaths = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0').filter(Boolean))];
  for (const filename of workingPaths) {
    const fullPath = path.join(root, filename);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) scan('working:' + filename, fs.readFileSync(fullPath));
  }
  const indexEntries = git('ls-files', '--stage', '-z').toString().split('\0').filter(Boolean);
  for (const entry of indexEntries) {
    const match = entry.match(/^\d+ ([a-f0-9]+) \d+\t([\s\S]+)$/);
    if (match) scan('index:' + match[2], git('cat-file', 'blob', match[1]));
  }
  const commits = git('rev-list', '--all').toString().trim().split('\n').filter(Boolean);
  const scannedBlobs = new Set();
  for (const rev of commits) {
    // Commit messages can also accidentally contain secrets.
    scan('history:' + rev.slice(0, 8) + ':commit-message', git('show', '-s', '--format=%B', rev));
    for (const entry of git('ls-tree', '-r', '-z', rev).toString().split('\0').filter(Boolean)) {
      const match = entry.match(/^\d+ blob ([a-f0-9]+)\t([\s\S]+)$/);
      if (!match || scannedBlobs.has(match[1] + ':' + match[2])) continue;
      scannedBlobs.add(match[1] + ':' + match[2]);
      scan('history:' + rev.slice(0, 8) + ':' + match[2], git('cat-file', 'blob', match[1]));
    }
  }
  console.log(JSON.stringify({ workingFiles: workingPaths.length, indexFiles: indexEntries.length, commits: commits.length, findings }, null, 2));
  process.exitCode = findings.length ? 1 : 0;
} catch {
  // Raw Git/IO errors might include confidential paths or inputs.
  console.error('Secret scan could not complete. Check local Git and file access; do not publish until resolved.');
  process.exitCode = 2;
}
