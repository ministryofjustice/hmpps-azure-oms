/**
 * The underlying API has
 *   savedSearches
 *     which have many schedules
 *     which have many actions
 *
 * But in practice you can't actually have many actions - it lets you save
 * the setup via API, but the alerts don't actually work
 *
 * We instead expose a model which has
 *   searchAlerts
 *     which have many alerts, up to one per alert level
 *
 * searchAlerts map 1-1 with savedSearch
 * an alert is a schedule + an action
 *
 * All searchAlerts created by this script have a name prefix of searchalert-
 * to make them easier to find again. They also get a category of SearchAlert
 * so they're easy to find in the UI
 */
const path = require('path');

const {ServiceClient} = require('ms-rest');

const {loadLocalCredentials} = require('./local-azure-creds');

const {sortByList} = require('./utils');

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

  client.getSearchAlerts = async function getSearchAlerts(cached) {
    const savedSearches = cached || await client.getSavedSearchesInFull();

    return client.convertToSearchAlerts(
      savedSearches.filter((s) => isSearchAlert(s.name))
    );
  }

  client.convertToSearchAlerts = function(searches) {
    return searches.map(convertToSearchAlert);
  }

  client.getSavedSearchesInFull = async function getSavedSearchesInFull() {
    const searches = await listSearches();
    return await Promise.all(searches.map(addSchedulesAndActions));
  }

  client.putSearchAlert = async function putSearchAlert(search) {
    await putSavedSearch(
      searchName(search.id),
      {
        DisplayName: search.name,
        Category: 'SearchAlert',
        Query: search.query,
        Version: 2,
        etag: '*',
      }
    );
  }

  client.putAlert = async function putAlert(search, level) {
    const alertName = actionName(search.id, level);
    const alert = search.alerts[level];
    await putSchedule(
      searchName(search.id),
      alertName,
      {
        Interval: alert.interval,
        QueryTimeSpan: alert.timespan,
        Enabled: alert.enabled,
        etag: '*',
      }
    );
    await putAction(
      searchName(search.id),
      alertName,
      alertName,
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
        Throttling: {
          DurationInMinutes: alert.throttle
        },
        etag: '*',
      }
    );
  }

  function searchName(searchId) {
    return 'searchalert-' + searchId;
  }
  function unSearchName(searchId) {
    return searchId.replace(/^searchalert-/, '');
  }
  function isSearchAlert(searchId) {
    return String(searchId).startsWith('searchalert-');
  }
  function actionName(searchId, level) {
    return searchId + '-' + level;
  }

  function convertToSearchAlert(search) {
    const searchAlert = {
      id: unSearchName(search.name),
      name: search.properties.DisplayName,
      query: search.properties.Query,
      alerts: {},
    };
    const sortSchedules = sortByList(
      ['informational', 'warning', 'critical'],
      (schedule) => getActionLevel(schedule.actions[0])
    );
    sortSchedules(search.schedules).forEach((schedule) => {
      const action = schedule.actions[0];
      const level = getActionLevel(action);
      const threshold = action.properties.Threshold;
      searchAlert.alerts[level] = {
        enabled: schedule.properties.Enabled,
        interval: schedule.properties.Interval,
        timespan: schedule.properties.QueryTimeSpan,
        threshold: [threshold.Operator.toLowerCase(), threshold.Value],
        metric: [
          threshold.MetricsTrigger.TriggerCondition.toLowerCase(),
          threshold.MetricsTrigger.Operator.toLowerCase(),
          threshold.MetricsTrigger.Value
        ],
        throttle: action.properties.Throttling.DurationInMinutes
      }
    });

    return searchAlert;
  }

  function getActionLevel(action) {
    return String(action.properties.Severity).toLowerCase();
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
