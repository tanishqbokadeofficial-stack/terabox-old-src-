const videoWatcher = require('../services/videoWatcher');
const dbService = require('../services/dbService');

async function runCli() {
  console.log('\n==================================================');
  console.log(' Starting TeraBox Video Watcher (CLI Mode 2)');
  console.log('==================================================\n');

  const args = process.argv.slice(2);
  const duration = parseInt(args[0], 10) || 30;
  const headless = args.includes('--headless');

  await videoWatcher.runWatchingMode(
    { watchDurationSeconds: duration, headless },
    (msg, level) => {
      if (level === 'success') console.log(`\x1b[32m${msg}\x1b[0m`);
      else if (level === 'error') console.log(`\x1b[31m${msg}\x1b[0m`);
      else if (level === 'warn') console.log(`\x1b[33m${msg}\x1b[0m`);
      else console.log(msg);
    },
    (prog) => {
      process.stdout.write(`\r[Account ${prog.currentIndex}/${prog.total}] Step ${prog.step}/5: ${prog.stepName || ''} (${prog.percent}%)`);
    }
  );

  console.log('\nVideo Watcher finished.\n');
  process.exit(0);
}

runCli().catch(err => {
  console.error('Fatal error in Video Watcher:', err);
  process.exit(1);
});
