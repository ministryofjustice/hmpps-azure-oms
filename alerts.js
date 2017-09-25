module.exports = function(saveSearch) {

  saveSearch({
    id: 'cpu',
    category: 'VMs',
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
    id: 'linux-disk',
    category: 'VMs',
    name: 'Linux Disks almost full',
    description: '',
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

}
