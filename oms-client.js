const {ServiceClient} = require('ms-rest');

const {loadLocalCredentials} = require('./local-azure-creds');

const RG_PATH = '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}';
const OMS_PATH = RG_PATH + '/providers/Microsoft.OperationalInsights/workspaces/{workspaceName}/';

exports.createOMSClient =
function createOMSClient({subscriptionId, resourceGroup, workspaceName}) {
  const creds = loadLocalCredentials(subscriptionId);
  const serviceClient = new ServiceClient(creds);

  const client = function(options) {
    options.pathTemplate = OMS_PATH + options.pathTemplate;
    options.pathParameters = Object.assign(
      {subscriptionId, resourceGroup, workspaceName},
      options.pathParameters
    );
    options.queryParameters = Object.assign(
      {'api-version': '2015-11-01-preview'},
      options.queryParameters
    );
    return new Promise((resolve, reject) => {
      serviceClient.sendRequest(options, (err, body, req, res) => {
        if (err) return reject(err);
        if (res.statusCode >= 400) {
          const e = new Error(`HTTP Error ${res.statusCode}`);
          e.req = req;
          e.res = res;
          e.body = body;
          return reject(e);
        }
        return resolve(body);
      });
    });
  };

  client.listSearches = function() {
    return client({
      method: 'GET',
      pathTemplate: '/savedSearches',
    }).then((response) => response.value);
  };

  return client;
}
