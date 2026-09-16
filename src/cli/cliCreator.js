const accountCreator = require('../services/accountCreator');
const dbService = require('../services/dbService');

async function runCli() {
  console.log('\n==================================================');
  console.log(' Starting TeraBox Account Creator (CLI Mode 1)');
  console.log('==================================================\n');

  const args = process.argv.slice(2);
  const count = parseInt(args[0], 10) || 1;
  const headless = args.includes('--headless');

  await accountCreator.runCreationCycle(
    { count, headless },
    (msg, level) => {
      if (level === 'success') console.log(`\x1b[32m${msg}\x1b[0m`);
      else if (level === 'error') console.log(`\x1b[31m${msg}\x1b[0m`);
      else if (level === 'warn') console.log(`\x1b[33m${msg}\x1b[0m`);
      else console.log(msg);
    },
    (prog) => {
      process.stdout.write(`\r[Cycle ${prog.cycle}/${prog.total}] Step ${prog.step}/8: ${prog.stepName || ''} (${prog.percent}%)`);
    }
  );

  console.log('\nAccount Creator finished.\n');
  process.exit(0);
}

runCli().catch(err => {
  console.error('Fatal error in Account Creator:', err);
  process.exit(1);
});
