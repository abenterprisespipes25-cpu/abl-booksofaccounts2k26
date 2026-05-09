const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WATCH_PATHS = [
  'src',
  'supabase',
  'public',
  'package.json',
  'index.html',
  'vite.config.ts'
];

const STATUS_FILE = path.join(process.cwd(), 'public', 'sync-status.json');

function updateStatus(status, message = '') {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({
      status, 
      message,
      lastSync: new Date().toISOString()
    }));
  } catch (e) {}
}

console.log('🟢 Antigravity Autonomous Sync Active');

async function sync(filePath, retryCount = 0) {
  const relPath = path.relative(process.cwd(), filePath);
  updateStatus('syncing', `Syncing: ${relPath}`);
  
  try {
    execSync('git add .', { stdio: 'ignore' });
    const status = execSync('git status --porcelain').toString();
    if (!status && filePath !== 'initial_startup') {
      updateStatus('synced', 'All changes pushed');
      return;
    }

    execSync(`git commit -m "Auto-update: ${relPath}"`, { stdio: 'ignore' });
    
    let success = false;
    let pushRetries = 3;
    while (!success && pushRetries > 0) {
      try {
        execSync('git -c core.sshCommand="ssh -o StrictHostKeyChecking=no" pull origin main --rebase', { stdio: 'ignore' });
        execSync('git -c core.sshCommand="ssh -o StrictHostKeyChecking=no" push origin main', { stdio: 'ignore' });
        success = true;
      } catch (e) {
        pushRetries--;
        if (pushRetries > 0) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (success) updateStatus('synced', 'Changes pushed to Lovable');
    else throw new Error('Failed to push after retries');
  } catch (error) {
    console.error(`🔴 Sync Error: ${error.message}`);
    updateStatus('error', 'Connection issue - Retrying automatically');
    if (retryCount < 10) setTimeout(() => sync(filePath, retryCount + 1), 10000);
  }
}

const watcher = chokidar.watch(WATCH_PATHS, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 }
});

watcher.on('add', p => sync(p)).on('change', p => sync(p)).on('unlink', p => sync(p));

updateStatus('synced', 'System Ready');
sync('initial_startup');

process.on('uncaughtException', (err) => {
  console.error('⚠️ Watcher Crash prevented:', err.message);
});
