exports.sortByList = function sortByList(list, extract = (x) => x) {
  return function sort(items) {
    return items.slice().sort((a, b) => {
      const aVal = extract(a), bVal = extract(b);
      if (aVal == bVal) return 0;
      return list.indexOf(aVal) - list.indexOf(bVal);
    });
  }
}
