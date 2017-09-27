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
    enabled: true,
    interval: 5,
    timespan: 15,
    alerts: {
      warning: {
        threshold: ["gt", 65],
        metric: ["total", "gt", 3],
        throttle: 0,
      },
      critical: {
        threshold: ["gt", 85],
        metric: ["total", "gt", 3],
        throttle: 0,
      }
    }
  });

  saveSearch({
    id: 'ram',
    name: 'Machines using high RAM',
    query: `Perf
    | where CounterName == "% Used Memory"
    | summarize AggregatedValue=avg(CounterValue)
      by bin(TimeGenerated, 1m), Computer
    `,
    enabled: true,
    interval: 5,
    timespan: 15,
    alerts: {
      warning: {
        threshold: ["gt", 80],
        metric: ["total", "gt", 5],
        throttle: 0,
      },
      critical: {
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
    enabled: true,
    interval: 5,
    timespan: 10,
    alerts: {
      warning: {
        threshold: ["gt", 85],
        metric: ["total", "gt", 1],
        throttle: 10,
      },
      critical: {
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
    enabled: true,
    interval: 5,
    timespan: 10,
    alerts: {
      warning: {
        threshold: ["gt", 85],
        metric: ["total", "gt", 1],
        throttle: 10,
      },
      critical: {
        threshold: ["gt", 95],
        metric: ["total", "gt", 3],
        throttle: 10,
      }
    }
  });

}
