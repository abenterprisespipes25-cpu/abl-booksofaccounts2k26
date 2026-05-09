import chokidar from 'chokidar';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = __dirname;
// The git root is 2 levels up based on the folder structure observed
const GIT_ROOT = path.resolve(PROJECT_ROOT, '../../'); 

const WATCH_PATHS = [
  'src',
  'supabase',
  'public',
  'package.json',
  'tailwind.config.ts',
  'vite.config.ts',
  'database',
  'config',
  'prompts'
].map(p => path.join(PROJECT_ROOT, p));

const STATUS_PATH = path.join(PROJECT_ROOT, 'public/sync-status.json');

function updateStatus(status, message) {
  const data = {
    status,
    message,
    lastSync: new Date().toISOString(),
  };
  try {
    if (!fs.existsSync(path.dirname(STATUS_PATH))) {
      fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    }
    fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to update status file:', e);
  }
}

console.log('🚀 Antigravity Lovable Sync Initializing...');
console.log(`📂 Project Root: ${PROJECT_ROOT}`);
console.log(`📂 Git Root: ${GIT_ROOT}`);
updateStatus('synced', 'System Ready');

let isSyncing = false;
let pendingSync = false;

const runGit = (cmd) => {
  try {
    console.log(`  🏃 ${cmd}`);
    execSync(cmd, { cwd: GIT_ROOT, stdio: 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
};

const sync = async () => {
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;
  pendingSync = false;

  console.log('\n🔄 Starting Auto-Sync...');
  updateStatus('syncing', 'Detecting changes...');

  // 1. Add
  runGit('git add .');

  // 2. Check if there are changes
  try {
    const status = execSync('git status --porcelain', { cwd: GIT_ROOT }).toString();
    if (!status) {
      console.log('  ✨ No changes to sync.');
      updateStatus('synced', 'Up to date');
      isSyncing = false;
      return;
    }
  } catch (e) {
    isSyncing = false;
    return;
  }

  // 3. Commit
  updateStatus('syncing', 'Committing changes...');
  if (!runGit('git commit -m "Auto sync update from Antigravity"')) {
    // Commit might fail if there's nothing to commit (unlikely given status check)
  }

  // 4. Pull & Rebase with Retry
  updateStatus('syncing', 'Fetching remote updates...');
  let pullSuccess = false;
  let retryCount = 0;
  const maxRetries = 5;

  while (!pullSuccess && retryCount < maxRetries) {
    if (runGit('git pull origin main --rebase')) {
      pullSuccess = true;
    } else {
      retryCount++;
      console.log(`  ⚠️ Pull failed. Retrying in 10s... (${retryCount}/${maxRetries})`);
      updateStatus('error', `Pull failed, retry ${retryCount}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  if (!pullSuccess) {
    console.error('  🛑 Critical: Git pull failed.');
    updateStatus('error', 'Sync paused: Conflict or Network issue');
    isSyncing = false;
    return;
  }

  // 5. Push with Retry
  updateStatus('syncing', 'Pushing to Lovable...');
  let pushSuccess = false;
  retryCount = 0;

  while (!pushSuccess && retryCount < maxRetries) {
    if (runGit('git push origin main')) {
      pushSuccess = true;
      console.log('  ✅ Synced successfully.');
      updateStatus('synced', 'Changes synced successfully to Lovable.');
    } else {
      retryCount++;
      console.log(`  ⚠️ Push failed. Retrying in 10s... (${retryCount}/${maxRetries})`);
      updateStatus('error', `Push failed, retry ${retryCount}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  isSyncing = false;
  if (pendingSync) {
    sync();
  }
};

// Initialize watcher
const watcher = chokidar.watch(WATCH_PATHS, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 100
  }
});

watcher
  .on('add', path => { console.log(`📄 Added: ${path}`); sync(); })
  .on('change', path => { console.log(`📝 Changed: ${path}`); sync(); })
  .on('unlink', path => { console.log(`🗑️ Removed: ${path}`); sync(); });

process.on('SIGINT', () => {
  watcher.close();
  process.exit();
});
