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

## Authentication

This CLI tool makes use of cached credentials used by the `az` commandline tool.

When you log in via `az login` credentials are stored in `~/.azure` which can be used to authenticate with the Azure REST APIs.

The access token lasts for one hour, but there is also a refresh token which lasts for a few weeks. You can use `az account get-access-token` to make the CLI refresh the access token and store it in the local cache.

## How it works

> TODO
