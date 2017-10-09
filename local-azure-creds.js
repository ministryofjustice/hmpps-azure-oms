const exec = require('child_process').execSync;

exports.loadLocalCredentials =
function loadLocalCredentials(subscriptionId) {
  try {
    const tokenData = exec(`az account get-access-token -s '${subscriptionId}'`);
    const data = JSON.parse(tokenData);
    const authorization = `${data.tokenType} ${data.accessToken}`;

    return {
      signRequest(webResource, callback) {
        webResource.headers.authorization = authorization;
        return callback(null);
      }
    };
  } catch (ex) {
    throw new Error(`
      Couldn't get valid azure token for ${subscriptionId}.
      Use \`az login\` to populate local credential file first.
      Error: ${ex.message}
    `);
  }
}
