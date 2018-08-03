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

const SUB_PATH = '/subscriptions/{subscriptionId}'
const VM_PATH = SUB_PATH + '/providers/Microsoft.Compute/virtualMachines';
const RG_PATH = SUB_PATH + '/resourceGroups/{resourceGroup}';
const VM_RG_PATH = RG_PATH + '/providers/Microsoft.Compute/virtualMachines';
const OMS_PATH = RG_PATH + '/providers/Microsoft.OperationalInsights/workspaces/{workspaceName}/';

exports.createOMSClient =
function createOMSClient({subscriptionId, resourceGroup, workspaceName}) {
  const creds = loadLocalCredentials(subscriptionId);
  const serviceClient = new ServiceClient(creds);

  const request = function(options) {
    options.pathParameters = Object.assign(
      {subscriptionId},
      options.pathParameters
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
  }

  const omsRequest = function(options) {
    options.pathTemplate = OMS_PATH + options.pathTemplate;
    options.pathParameters = Object.assign(
      {resourceGroup, workspaceName},
      options.pathParameters
    );
    options.queryParameters = Object.assign(
      {'api-version': '2017-04-26-preview'},
      options.queryParameters
    );
    return request(options);
  };

  const client = {};

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

  client.deleteSearchAlert = async function putSearchAlert(id) {
    const searchId = searchName(id);
    const schedules = await getSchedules(searchId);
    for (let schedule of schedules) {
      await deleteSchedule(searchId, schedule.name);
    }

    await deleteSavedSearch(searchId);
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

  client.getActiveComputers = async function getActiveComputers() {
    const searchResults = await omsRequest({
      method: 'GET',
      pathTemplate: 'api/query',
      queryParameters: {
        'api-version': '2017-01-01-preview',
        query: 'Heartbeat | distinct Computer',
        timespan: 'PT1H',
      },
    });

    return searchResults.Tables[0].Rows
      .map(([name]) => name.toUpperCase())
      .map((name) => {
        const i = name.indexOf('.');
        return i === -1 ? name : name.slice(0, i);
      })
      .sort();
  }

  client.getAllVMs = async function getAllVMs() {
    let response = await request({
      method: 'GET',
      pathTemplate: VM_PATH,
      queryParameters: {
        'api-version': '2016-04-30-preview'
      }
    });
    const vms = response.value;

    while (response.nextLink) {
      response = await request({
        method: 'GET',
        url: response.nextLink
      });
      vms.push(...response.value);
    }
    return vms.map((vm) => ({
      name: vm.name.toUpperCase(),
      notMonitored: (vm.tags || {}).not_monitored == 'true',
      rg: extractResourceGroup(vm.id)
    }));
  }

  client.getVMPowerState = async function getVMPowerState(vms) {
    const result = {};

    for (let {name, rg} of vms) {
      const vmInfo = await request({
        method: 'GET',
        pathTemplate: VM_RG_PATH + '/{vm}/InstanceView',
        pathParameters: {vm: name, resourceGroup: rg},
        queryParameters: {
          'api-version': '2016-04-30-preview'
        }
      });
      result[name] = getPowerState(vmInfo.statuses);
    }

    return result;
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
  function extractResourceGroup(id) {
    const m = /resourceGroups\/([\w-]+?)\//.exec(id);
    if (!m) {
      throw new Error(`Failed to find resourceGroup from ${id}`);
    }
    return m[1];
  }
  function getPowerState(statuses) {
    const on = statuses.find((status) => status.code == 'PowerState/running');
    return on ? 'on' : 'off';
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
    return omsRequest({
      method: 'GET',
      pathTemplate: 'savedSearches',
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
    return omsRequest({
      method: 'GET',
      pathTemplate: 'savedSearches/{searchId}',
      pathParameters: {searchId}
    });
  }

  function putSavedSearch(searchId, properties) {
    return omsRequest({
      method: 'PUT',
      pathTemplate: 'savedSearches/{searchId}',
      pathParameters: {searchId},
      body: {properties},
    });
  }

  function deleteSavedSearch(searchId) {
    return omsRequest({
      method: 'DELETE',
      pathTemplate: 'savedSearches/{searchId}',
      pathParameters: {searchId},
    });
  }

  function getAllSchedules() {
    return omsRequest({
      method: 'GET',
      pathTemplate: 'schedules',
    })
      .then(basenameIds);
  }

  function getSchedules(searchId) {
    return omsRequest({
      method: 'GET',
      pathTemplate: 'savedSearches/{searchId}/schedules',
      pathParameters: {searchId}
    })
      .then(extractValue)
      .then(basenameIds);
  }

  function putSchedule(searchId, scheduleId, properties) {
    return omsRequest({
      method: 'PUT',
      pathTemplate: 'savedSearches/{searchId}/schedules/{scheduleId}',
      pathParameters: {searchId, scheduleId},
      body: {properties},
    });
  }

  function deleteSchedule(searchId, scheduleId) {
    return omsRequest({
      method: 'DELETE',
      pathTemplate: 'savedSearches/{searchId}/schedules/{scheduleId}',
      pathParameters: {searchId, scheduleId}
    });
  }

  function getActions(searchId, scheduleId) {
    return omsRequest({
      method: 'GET',
      pathTemplate: 'savedSearches/{searchId}/schedules/{scheduleId}/actions',
      pathParameters: {searchId, scheduleId}
    })
      .then(extractValue)
      .then(basenameIds);
  }

  function putAction(searchId, scheduleId, actionId, properties) {
    return omsRequest({
      method: 'PUT',
      pathTemplate: 'savedSearches/{searchId}/schedules/{scheduleId}/actions/{actionId}',
      pathParameters: {searchId, scheduleId, actionId},
      body: {properties},
    });
  }

  function deleteAction(searchId, scheduleId, actionId) {
    return omsRequest({
      method: 'PUT',
      pathTemplate: 'savedSearches/{searchId}/schedules/{scheduleId}/actions/{actionId}',
      pathParameters: {searchId, scheduleId, actionId},
    });
  }

  client.raw = {
    listSearches,
    getSavedSearch, putSavedSearch, deleteSavedSearch,
    getAllSchedules, getSchedules, putSchedule, deleteSchedule,
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
