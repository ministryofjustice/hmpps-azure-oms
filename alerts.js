module.exports = function(saveSearch) {

  saveSearch({
    id: 'cpu',
    name: 'Machines using high CPU',
    query: `Perf
    | where ObjectName == "Processor"
      and CounterName == "% Processor Time"
      and InstanceName == "_Total"
    | summarize AggregatedValue=avg(CounterValue)
      by bin(TimeGenerated, 1m), Computer
    `,
    alerts: {
      warning: {
        enabled: true,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 65],
        metric: ["total", "gt", 3],
        throttle: 0,
      },
      critical: {
        enabled: true,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 85],
        metric: ["total", "gt", 3],
        throttle: 0,
      }
    }
  });

  saveSearch({
    id: 'windows-ram',
    name: 'Windows Machines using high RAM',
    query: `Perf
    | where CounterName == "% Committed Bytes In Use"
    | summarize AggregatedValue=avg(CounterValue)
      by bin(TimeGenerated, 1m), Computer
    `,
    alerts: {
      warning: {
        enabled: true,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 80],
        metric: ["total", "gt", 5],
        throttle: 0,
      },
      critical: {
        enabled: true,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 90],
        metric: ["total", "gt", 5],
        throttle: 0,
      }
    }
  });

  saveSearch({
    id: 'linux-ram',
    name: 'Linux Machines using high RAM',
    query: `Perf
    | where CounterName == "% Used Memory"
    | summarize AggregatedValue=avg(CounterValue)
      by bin(TimeGenerated, 1m), Computer
    `,
    alerts: {
      warning: {
        enabled: false,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 80],
        metric: ["total", "gt", 5],
        throttle: 0,
      },
      critical: {
        enabled: false,
        interval: 5,
        timespan: 15,
        threshold: ["gt", 90],
        metric: ["total", "gt", 5],
        throttle: 0,
      }
    }
  });

  saveSearch({
    id: 'linux-disk',
    name: 'Linux Disks almost full',
    query: `Perf
    | where CounterName == "% Used Space"
    | extend Disk = strcat(Computer, " ", InstanceName)
    | summarize AggregatedValue = max(CounterValue)
      by bin(TimeGenerated, 5m), Disk
    `,
    alerts: {
      warning: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 85],
        metric: ["total", "gt", 1],
        throttle: 10,
      },
      critical: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 95],
        metric: ["total", "gt", 3],
        throttle: 10,
      }
    }
  });


  saveSearch({
    id: 'linux-inodes',
    name: 'Linux Disk Inodes almost full',
    query: `Perf
    | where CounterName == "% Used Inodes"
    | extend Disk = strcat(Computer, " ", InstanceName)
    | summarize AggregatedValue = max(CounterValue)
      by bin(TimeGenerated, 5m), Disk
    `,
    alerts: {
      warning: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 85],
        metric: ["total", "gt", 1],
        throttle: 10,
      },
      critical: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 95],
        metric: ["total", "gt", 3],
        throttle: 10,
      }
    }
  });

  saveSearch({
    id: 'windows-disk',
    name: 'Windows Disks almost full',
    query: `Perf
    | where CounterName == "% Free Space"
    | extend Disk = strcat(Computer, " ", InstanceName)
    | summarize AggregatedValue = max(100 - CounterValue)
      by bin(TimeGenerated, 5m), Disk
    `,
    alerts: {
      warning: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 85],
        metric: ["total", "gt", 1],
        throttle: 10,
      },
      critical: {
        enabled: true,
        interval: 5,
        timespan: 10,
        threshold: ["gt", 95],
        metric: ["total", "gt", 3],
        throttle: 10,
      }
    }
  });

  saveSearch({
    id: 'offline-agents',
    name: 'Offline OMS Agents',
    query: `Heartbeat
| summarize TimeGenerated=max(TimeGenerated) by Computer
| where TimeGenerated < ago(1h)
| summarize AggregatedValue=count() by bin(TimeGenerated, 1s), Computer
    `,
    alerts: {
      critical: {
        enabled: true,
        interval: 15,
        timespan: 1440,
        threshold: ["gt", 0],
        metric: ["total", "gt", 0],
        throttle: 60,
      },
    }
  });

  saveSearch({
    id: 'nsg-change',
    name: 'NSG Changes',
    query: `AzureActivity
| where ActivityStatus == "Accepted"
  and (
    OperationName contains "Microsoft.Network/networkSecurityGroups/securityRules/"
    or
    OperationName contains "Microsoft.Network/networkSecurityGroups/delete"
  )
| extend
    Op = extract("networkSecurityGroups/(.*)$", 1, OperationName),
    Item = extract("networkSecurityGroups/(.*)$", 1, ResourceId),
    Action = case(
  ActivitySubstatus contains "201", "Created",
  ActivitySubstatus contains "200", "Updated",
  ActivitySubstatus contains "202", "Deleted",
  "Unknown"
  )
| project TimeGenerated, Label=strcat(Action, " ", Item, " from ", ResourceGroup, " by ", Caller, " at ", TimeGenerated)
| summarize AggregatedValue=count() by bin(TimeGenerated, 1s), Label
    `,
    alerts: {
      informational: {
        enabled: true,
        interval: 15,
        timespan: 60,
        threshold: ["gt", 0],
        metric: ["total", "gt", 0],
        throttle: 60,
      },
    }
  });

}
