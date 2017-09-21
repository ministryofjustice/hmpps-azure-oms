const os = require('os');

const PROFILE_PATH = '~/.azure/azureProfile.json';
const TOKEN_PATH = '~/.azure/accessTokens.json';

exports.loadLocalCredentials =
function loadLocalCredentials(subscriptionId) {
  const profile = loadAzureJson(PROFILE_PATH);
  const subInfo = profile.subscriptions.find((s) => s.id == subscriptionId);
  const accessTokens = loadAzureJson(TOKEN_PATH);
  const access = extractAccessToken(accessTokens, subInfo);

  if (!access) {
    throw new Error(`
      Couldn't find valid azure credentials for ${subscriptionId}.
      Use \`az login\` to populate local credential file first.
      Tokens only last for 1 hour, but you can use \`az account get-access-token\` to force a refresh
    `);
  }

  return {
    signRequest(webResource, callback) {
      webResource.headers.authorization = access.authorization;
      return callback(null);
    }
  };
}

function loadAzureJson(filename) {
  const expanded = filename.replace('~', os.homedir());
  try {
    return require(expanded);
  } catch (ex) {
    throw new Error(`Failed to open ${filename}, log in with az cli first`);
  }
}

function extractAccessToken(tokens, {tenantId}) {
  const match = tokens.find((token) => (
    String(token._authority).endsWith(tenantId)
    && String(token.resource).includes("management")
    && new Date(token.expiresOn) > new Date()
  ));

  return match && {
    clientId: match._clientId,
    authorization: `${match.tokenType} ${match.accessToken}`
  };
}
