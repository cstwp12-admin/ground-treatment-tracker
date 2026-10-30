(function (root) {
  'use strict';
  const version = 'stage-length-v1';
  const excluded = new Set(['Omitted', 'Under Review', 'Not Required']);
  const length = record => Math.max(0, Number(record.to) - Number(record.from));
  function progress(record) {
    if (excluded.has(record.status)) return null;
    let numerator = 0, denominator = 0;
    for (const stage of record.stages) {
      if (stage.rating === 'NA') continue;
      const weight = Number(stage.weight) || 0;
      numerator += weight * (Number(stage.rating) || 0);
      denominator += weight;
    }
    return denominator ? numerator / denominator : null;
  }
  function weightedAverage(records, get = progress) {
    let numerator = 0, denominator = 0;
    for (const record of records) {
      const value = get(record);
      if (value == null) continue;
      numerator += length(record) * value;
      denominator += length(record);
    }
    return denominator ? numerator / denominator : 0;
  }
  const api = {version, progress, length, weightedAverage};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GTCalculations = api;
})(typeof window === 'object' ? window : globalThis);
