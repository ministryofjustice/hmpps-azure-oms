# HMPPS Azure OMS

A repo to setup Azure OMS with alerts and such.

## Setup

  * Install the Azure 2.0 CLI
  * Authenticate the CLI with Azure
  * Install Node.js 8.5+
  * `npm install`

## Usage

See CLI help for full accurate details

```
node main.js --help
```

## Defining Alerts

The alerts themselves are defined in `alerts.js`.

The "metric" alert type is always used, as the resulting alert then has a `ResourceValue` and we get one item per failure.

## Authentication

This CLI tool makes use of cached credentials used by the `az` commandline tool.

When you log in via `az login` credentials are stored in `~/.azure` which can be used to authenticate with the Azure REST APIs.

The access token lasts for one hour, but there is also a refresh token which lasts for a few weeks. You can use `az account get-access-token` to make the CLI refresh the access token and store it in the local cache.

## Commands

### diff

Shows the differences between configured alerts and what is declared in the `alerts.js` file.

### apply

Sync the local changes shown in the diff

### computers

Produce a diff of VMs which exist in the portal compared to computers which have produce a heartbeat to OMS recently

### raw

Produce a raw dump of all the configured searches and alerts from OMS, mostly useful for development / debugging

## Dashboard Views

This is not currently automated, the `omsview` JSON files are exported from the Azure OMS view designer, and can be imported back into any environment.
