/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

require('console.table');

const {createOMSClient} = require('./oms-client');

function parseArgs() {
  const argv = require('yargs')
    .options('environment', {
      alias: 'e',
      choices: getEnvironmentsList(),
      demandOption: true,
    })
    .command('diff', 'Show changes to search alerts')
    .command('apply', 'Make the changes to search alerts')
    .command('raw', 'Show all raw search data')
    .demandCommand(1, 'You must specify the command')
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

const commands = {apply, diff, raw};

async function apply(client) {
  const searchAlerts = loadDesiredAlerts();

  for (let searchAlert of searchAlerts) {
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

async function diff(client) {
  const alerts = await client.getSearchAlerts();
  console.log(JSON.stringify(alerts, null, 2));
}

async function raw(client) {
  const alerts = await client.getSearchAlerts(true);
  console.log(JSON.stringify(alerts, null, 2));
  // console.log(alerts.length);
  // console.log(alerts.map((a) => a.Alerts[0].properties.Name));

  // console.log(await client.getSavedSearch('cpu utilization'));
  // console.log(await client.getSchedules('cpu utilization'));
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




main()
  .then(() => console.log(""))
  .catch((err) => {
    console.error("Unexpected error", err);
    process.exit(1);
  });
