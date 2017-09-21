/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

require('console.table');

const {createOMSClient} = require('./oms-client');

main()
  .then(() => console.log(""))
  .catch((err) => {
    console.error("Unexpected error", err);
    process.exit(1);
  });

async function main() {
  const args = parseArgs();
  const env = getEnvironment(args.environment);

  const client = createOMSClient(env);

  const searches = await client.listSearches()
  const searchSummary = searches.map((search) => ({
    category: search.properties.Category,
    name: search.properties.DisplayName,
  }));

  console.table(searchSummary);
}

function parseArgs() {
  const argv = require('yargs')
    .options('environment', {
      alias: 'e',
      choices: getEnvironmentsList(),
      demandOption: true,
    })
    .options('force', {
      alias: 'f',
      boolean: true,
      default: false,
    })
    .argv;

  return argv;
}

function getEnvironment(name) {
  return require(`./environments/${name}`);
}

function getEnvironmentsList() {
  return fs.readdirSync('./environments')
    .map((filename) => path.basename(filename, '.js'));
}
