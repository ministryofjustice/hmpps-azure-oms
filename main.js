/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const jsdiff = require('diff');

require('console.table');

const {createOMSClient} = require('./oms-client');

function parseArgs() {
  const argv = require('yargs')
    .option('environment', {
      alias: 'e',
      choices: getEnvironmentsList(),
      demandOption: true,
    })
    .command('diff', 'Show changes to search alerts', yargs => {
      yargs.option('cached', {
        string: true,
        normalize: true,
        describe: 'Path to cached raw output to diff against'
      })
    })
    .command('apply', 'Make the changes to search alerts')
    .command('raw', 'Show all raw search data', yargs => {
      yargs.option('all', {
        boolean: true,
        default: false,
        describe: 'Include saved searches with no alert configuration'
      })
    })
    .command('computers', 'Compare list of VMs that exist to OMS\'s list', yargs => {
      yargs.option('ignore', {
        string: true,
        default: '',
        describe: 'comma separated list of VMs to ignore',
        coerce: (arg) => arg.split(',')
      })
      yargs.option('junit', {
        string: true,
        describe: 'produce output in junit format to filename'
      })
    })
    .demandCommand(1, 'You must specify the command')
    .strict()
    .argv;

  return argv;
}

async function main() {
  const args = parseArgs();
  const env = getEnvironment(args.environment);

  const client = createOMSClient(env);

  const command = commands[args._[0]];
  return command(client, args);
}

const commands = {apply, diff, raw, computers};

async function apply(client) {
  const desired = loadDesiredAlerts();
  const current = await client.getSearchAlerts();

  const toDelete = idsToDelete(current, desired);
  for (let id of toDelete) {
    console.log("Deleting search %s", id);
    await client.deleteSearchAlert(id);
  }

  for (let searchAlert of desired) {
    console.log("Saving search %s: %s", searchAlert.id, searchAlert.name);
    await client.putSearchAlert(searchAlert);
    console.log("Saved search %s OK", searchAlert.id);
    for (let level in searchAlert.alerts) {
      console.log("  Saving alert for %s at %s", searchAlert.id, level);
      await client.putAlert(searchAlert, level);
      console.log("  Saved alert for %s at %s OK", searchAlert.id, level);
    }
  }
}

async function diff(client, args) {
  const expected = loadDesiredAlerts();

  const cached = args.cached && require(path.join(process.cwd(), args.cached));
  const actual = await client.getSearchAlerts(cached);
  const actualById = groupById(actual);

  const extras = idsToDelete(actual, expected);

  let differences = false;

  extras.forEach((extra) => {
    printDiff(actualById[extra], null);
  });

  expected.forEach((item) => {
    printDiff(actualById[item.id], item);
  });

  function printDiff(actual, expected) {
    const actualString = JSON.stringify(actual, null, 2);
    const expectedString = JSON.stringify(expected, null, 2);

    if (actualString === expectedString) {
      return false;
    }

    console.log(jsdiff.createTwoFilesPatch(
      actual ? actual.id : 'missing',
      expected ? expected.id : 'missing',
      String(actualString),
      String(expectedString),
      'from Azure REST API',
      'from ./alerts.js'
    ));

    differences = true;
  }

  return differences ? 1 : 0;
}

async function raw(client, args) {
  let savedSearches = await client.getSavedSearchesInFull();

  if (!args.all) {
    savedSearches = savedSearches.filter((s) => s.schedules.length);
  }

  console.log(JSON.stringify(savedSearches, null, 2));
}

async function computers(client, args) {
  const activeComputers = await client.getActiveComputers();
  const vms = await client.getAllVMs();
  const vmNames = vms.map(vm => vm.name).sort();

  const toCompare = listSubtract(vmNames, args.ignore);
  const missing = listSubtract(toCompare, activeComputers);

  if (missing.length === 0) {
    return 0;
  }

  const missingSet = new Set(missing);
  const missingVms = vms.filter(vm => missingSet.has(vm.name));
  const powerStates = await client.getVMPowerState(missingVms);

  const offline = missing.filter((vm) => powerStates[vm] === "off");
  const online = listSubtract(missing, offline);

  computersSummary(offline, online, missing.length);
  if (args.junit) {
    const junit = computersSummaryJUnit(
      args.environment, offline, online, missing.length
    );
    fs.writeFileSync(args.junit, junit);
  }

  return online.length > 0;
}

function computersSummaryJUnit(env, offline, online, total) {
  let x = '<?xml version="1.0" encoding="UTF-8"?>';
  x += `<testsuites>`;
  x += `<testsuite
    name="VMs missing heartbeat"
    tests="${total}"
    failures="${online.length}"
    skipped="${offline.length}"
  >`;
  offline.forEach((vm) => {
    x += `
    <testcase name="${vm}" classname="offline">
      <skipped message="offline" />
    </testcase>`;
  });
  online.forEach((vm) => {
    x += `
    <testcase name="${vm}" classname="${env} missing heartbeat">
      <failure message="no heartbeat" />
    </testcase>`;
  });
  x += '</testsuite></testsuites>';
  return x;
}

function computersSummary(offline, online, total) {
  if (offline.length) {
    console.log("VMs missing heartbeat but offline:")
    console.log(offline.join("\n"));
    console.log("-------------------");
  }

  if (online.length) {
    console.log("VMs which exist but have no recent heartbeat:")
    console.log(online.join("\n"));
    console.log("-------------------");
  }

  console.log("offline: %d", offline.length);
  console.log("online: %d", online.length);
  console.log("total: %d", total);
}

function getEnvironment(name) {
  return require(`./environments/${name}`);
}

function getEnvironmentsList() {
  return fs.readdirSync('./environments')
    .map((filename) => path.basename(filename, '.js'));
}

function loadDesiredAlerts() {
  const searchAlerts = [];
  function saveSearch(details) {
    // TODO: validate search schemas
    searchAlerts.push(details);
  }
  require('./alerts')(saveSearch);

  return searchAlerts;
}

function idsToDelete(before, after) {
  return listSubtract(before.map(x => x.id), after.map(x => x.id));
}

function listSubtract(a, b) {
  const bSet = new Set(b);

  return a.filter((x) => !bSet.has(x));
}

function groupById(items) {
  const grouped = {};
  items.forEach((item) => {
    const id = item.id;
    if (grouped[id]) {
      throw new Error(`Unexpected repeated ID '${id}'`);
    }
    grouped[id] = item;
  });
  return grouped;
}


main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error("Unexpected error", err);
    process.exit(1);
  });
