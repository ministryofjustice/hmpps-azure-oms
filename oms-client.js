/**
 * The underlying API has
 *   savedSearches
 *     which have many schedules
 *     which have many actions
 *
 * We instead expose a model which has
 *   searchAlerts
 *     which have many alerts, up to one per alert level
 *
 * searchAlerts map 1-1 with savedSearch + schedule
 * an alert is a single action (which is where the thresholds live)
 *
 * All searchAlerts created by this script have a name prefix of searchalert-
 * to make them easier to find again
 */
const path = require('path');

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
      {'api-version': '2017-04-26-preview'},
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

  client.getSearchAlerts = async function getSearchAlerts(all = false) {
    let searches = await listSearches();
    if (!all) {
      searches = searches.filter((search) => isSearchAlert(search.name));
    }

    searches = await Promise.all(searches.map(addSchedulesAndActions));

    return searches;
  }

  client.putSearchAlert = async function putSearchAlert(search) {
    await putSavedSearch(
      searchName(search.id),
      {
        DisplayName: search.name + ' [SearchAlert]',
        Category: search.category,
        Query: search.query,
        Version: 2,
        etag: '*',
      }
    );
    await putSchedule(
      searchName(search.id),
      scheduleName(search.id),
      {
        Interval: search.interval,
        QueryTimeSpan: search.timespan,
        Enabled: search.enabled,
        etag: '*',
      }
    );
  }

  client.putAlert = async function putAlert(search, level) {
    const alert = search.alerts[level];
    return await putAction(
      searchName(search.id),
      scheduleName(search.id),
      actionName(search.id, level),
      {
        Type: "Alert",
        Name: `${search.name} (${level})`,
        Severity: level,
        Threshold: {
          Operator: alert.threshold[0],
          Value: alert.threshold[1],
          MetricsTrigger: {
            TriggerCondition: alert.metric[0],
            Operator: alert.metric[1],
            Value: alert.metric[2],
          }
        },
        etag: '*',
      }
    );
  }

  function searchName(searchId) {
    return 'searchalert-' + searchId;
  }
  function isSearchAlert(searchName) {
    return String(searchName).startsWith('searchalert-');
  }
  function scheduleName(searchId) {
    return searchId + '-schedule';
  }
  function actionName(searchId, level) {
    return searchId + '-' + level;
  }

  function listSearches() {
    return client({
      method: 'GET',
      pathTemplate: '/savedSearches',
    })
      .then(extractValue);
  }

  async function addSchedulesAndActions(search) {
    const schedules = await getSchedules(search.name);
    await Promise.all(schedules.map(async function (schedule) {
      schedule.actions = await getActions(search.name, schedule.name);
    }));
    return {
      name: search.name,
      properties: search.properties,
      schedules,
    };
  }

  function getSavedSearch(searchId) {
    return client({
      method: 'GET',
      pathTemplate: '/savedSearches/{searchId}',
      pathParameters: {searchId}
    });
  }

  function putSavedSearch(searchId, properties) {
    return client({
      method: 'PUT',
      pathTemplate: '/savedSearches/{searchId}',
      pathParameters: {searchId},
      body: {properties},
    });
  }

  function deleteSavedSearch(searchId) {
    return client({
      method: 'DELETE',
      pathTemplate: '/savedSearches/{searchId}',
      pathParameters: {searchId},
    });
  }

  function getSchedules(searchId) {
    return client({
      method: 'GET',
      pathTemplate: '/savedSearches/{searchId}/schedules',
      pathParameters: {searchId}
    })
      .then(extractValue)
      .then(basenameIds);
  }

  function putSchedule(searchId, scheduleId, properties) {
    return client({
      method: 'PUT',
      pathTemplate: '/savedSearches/{searchId}/schedules/{scheduleId}',
      pathParameters: {searchId, scheduleId},
      body: {properties},
    });
  }

  function deleteSchedule(searchId, scheduleId) {
    return client({
      method: 'DELETE',
      pathTemplate: '/savedSearches/{searchId}/schedules/{scheduleId}',
      pathParameters: {searchId, scheduleId}
    });
  }

  function getActions(searchId, scheduleId) {
    return client({
      method: 'GET',
      pathTemplate: '/savedSearches/{searchId}/schedules/{scheduleId}/actions',
      pathParameters: {searchId, scheduleId}
    })
      .then(extractValue)
      .then(basenameIds);
  }

  function putAction(searchId, scheduleId, actionId, properties) {
    return client({
      method: 'PUT',
      pathTemplate: '/savedSearches/{searchId}/schedules/{scheduleId}/actions/{actionId}',
      pathParameters: {searchId, scheduleId, actionId},
      body: {properties},
    });
  }

  function deleteAction(searchId, scheduleId, actionId) {
    return client({
      method: 'PUT',
      pathTemplate: '/savedSearches/{searchId}/schedules/{scheduleId}/actions/{actionId}',
      pathParameters: {searchId, scheduleId, actionId},
    });
  }

  client.raw = {
    listSearches,
    getSavedSearch, putSavedSearch, deleteSavedSearch,
    getSchedules, putSchedule, deleteSchedule,
    getActions, putAction, deleteAction
  };

  return client;
}

function extractValue(response) {
  return response.value;
}
function basenameIds(items) {
  items.forEach((item) => {
    item.name = path.basename(item.id);
  });
  return items;
}
