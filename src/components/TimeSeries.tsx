import { DataFrame, FieldType, getFieldDisplayName, reduceField, ReducerID } from '@grafana/data';
import { sliderTime } from 'components/TimeSlider';
import { DataRefTransform, DataRefTransformQuery, TestConfig } from './Config';

export type TimeSeries = {
  time: {
    valuesIndex?: number | null;
    values: number[];
    closestTimeDelta?: number | null;  // Time delta from target time for hole detection
    hasHoles?: boolean;                 // Whether this timeseries has holes (gaps larger than query interval)
    holeThreshold?: number;             // Threshold for detecting holes (based on query interval)
    inHole?: boolean;                  // Whether the current interpolated point is in a hole
    targetTime?: number;                // The target time for interpolation (when in hole detected)
  }
  values: Array<number | string | null>;
  labels: Map<string, string>;
  aggregations: Map<string, number>;
};

export type TimeSeriesData = {
  timeMin: number;           // Panel time range (for field of view)
  timeMax: number;           // Panel time range (for field of view)
  timeRange: number;         // Panel time range (for field of view)
  dataTimeMin: number;       // Actual data time range (for validation)
  dataTimeMax: number;       // Actual data time range (for validation)
  queryIntervalMs: number;   // Query interval from data.request.intervalMs (for hole detection)
  ts: Map<string, TimeSeries>;
};

export type SeriesStats = {
  min?: number;
  max?: number;
  mean?: number;
  last?: number;
  lastNotNull?: number;
  count?: number;
};


export function seriesExtend(tsData: TimeSeriesData, testConfig: TestConfig | undefined) {
  const timeMin = tsData.timeMin;
  const timeMax = tsData.timeMax;
  const dataSparse = testConfig?.testDataSparse;
  const dataExtendedZero = testConfig?.testDataExtendedZero;
  const baseOffset = typeof testConfig?.testDataBaseOffset === 'number' ? testConfig.testDataBaseOffset : 1;
  const create = function(datapoints: number, scalar: number, fn: (inp: number) => number, asString: boolean, labels: Map<string,string>| null) {
    const intervalTime = Math.ceil((timeMax - timeMin) / datapoints);
    const intervalValue = 2 * Math.PI / datapoints;
    let timeValues = [];
    let dataValues = [];
    for (let i = 0; i <  datapoints; i++) {
      timeValues.push(timeMin + (i * intervalTime));

      const dv = scalar * (baseOffset + fn(i * intervalValue));
      const val1 = dataSparse && ((i % 10) > 5) ? null : dataExtendedZero && Math.abs(dv) < 20 ? 0 : dv;
      const val2 = asString && (typeof val1 === 'number') ? '*' + Math.ceil(val1).toString() + '*' : val1;
      dataValues.push(val2);
    }
    if (labels === null ) {
      labels = new Map();
    }

    return {
      time: {values: timeValues},
      values: dataValues,
      labels: labels,
      aggregations: new Map(),
    };
  }

  let dataSets = [
    {name: 'test-data-small-sin', datapoints: 75, scalar: 100, fn: Math.sin, asString: false, labels: new Map<string,string>([['label1', 'value1'], ['label2_num', '2'],]) },
    {name: 'test-data-large-sin', datapoints: 50, scalar: 500, fn: Math.sin, asString: false, labels: null},
    {name: 'test-data-small-cos', datapoints: 60, scalar: 100, fn: Math.cos, asString: false, labels: null},
    {name: 'test-data-large-cos', datapoints: 88, scalar: 500, fn: Math.cos, asString: false, labels: null},
  ];

  if (testConfig?.testDataStringData) {
    dataSets.push({name: 'test-data-string', datapoints: 65, scalar: 500, fn: Math.cos, asString: true, labels: null});
  }

  dataSets.forEach((ds) => {
    if (!tsData.ts.get(ds.name)) {
      tsData.ts.set(ds.name, create(ds.datapoints, ds.scalar, ds.fn, ds.asString, ds.labels));
    }
  });
  if (testConfig?.testDataNoTime) {
    const name = 'test-data-no-time';
    if (!tsData.ts.get(name)) {
      tsData.ts.set(name, {values: [123], time: {values: [0], valuesIndex: null}, labels: new Map(), aggregations: new Map()});
    }
  }
}

function transformTabular(frame: any, keyColumnName: string, applyNamespace: (name: string) => string, tsNamed: Record<string, any>) {
  let keyColumnIndex = undefined;
  for (let i = 0; i < frame.fields.length; i++) {
    if (keyColumnName === getFieldDisplayName(frame.fields[i], frame)) {
      keyColumnIndex = i;
      break;
    }
  }
  if (typeof keyColumnIndex === 'number') {
    const keyColumn = frame.fields[keyColumnIndex];
    frame.fields.forEach((ts: any) => {
      if (ts !== keyColumn) {
        const fieldName = getFieldDisplayName(ts, frame);
        for (let i = 0; i < ts.values.length; i++) {
          const name = applyNamespace(keyColumn.values[i] + '.' + fieldName);
          const values = [ts.values[i]];
          tsNamed[name] = {values: values, time: null};
        }
      }
    })
  }
}

// This transforms the data so we have name-indexable sets of time and value.
// i.e.:
// - series: [fields: [{name, values}]] => Map<string, TimeSeries>
// Detect holes in time series data (gaps larger than expected interval)
function detectHoles(ts: TimeSeries, queryIntervalMs: number): { hasHoles: boolean, holeThreshold: number } {

  const holeThreshold = queryIntervalMs * 2 - Math.ceil(queryIntervalMs * .1)

  if (!ts.time.values || ts.time.values.length < 2) {
    return { hasHoles: false, holeThreshold: holeThreshold };
  }

  // Calculate the hole threshold (2x the query interval)
  let hasHoles = false;

  // Check for gaps larger than the threshold
  for (let i = 1; i < ts.time.values.length; i++) {
    const timeDiff = ts.time.values[i] - ts.time.values[i - 1];
    if (timeDiff > holeThreshold) {
      hasHoles = true;
      break;
    }
  }

  return { hasHoles, holeThreshold };
}

export function seriesTransform(series: any[], panelTimeMin: number, panelTimeMax: number, dataRefTransform: DataRefTransform | undefined, queryIntervalMs: number): TimeSeriesData {
  const timeSeries = new Map<string, TimeSeries>();
  let dataTimeMin: number | undefined = undefined;
  let dataTimeMax: number | undefined = undefined;

  const drt = dataRefTransform || {namespaced: false, queries: new Map<string, DataRefTransformQuery>()};

  series.forEach((frame: any) => {
    function applyNamespace(name: string) {
      return drt.namespaced ? (frame.refId || 'GBL') + '.' + name : name;
    }

    if (('fields' in frame) && Array.isArray(frame.fields)) {
      let tsTime: null | {valuesIndex: null | number, values: any} = null;
      let tsNamed: Record<string, any> = {};
  
      const keyColumnName = frame.refId && drt.queries.get(frame.refId)?.tabularKeyColumn;
      if (keyColumnName) {
        transformTabular(frame, keyColumnName, applyNamespace, tsNamed);
      }
      else {
        frame.fields.forEach(function(ts: any) {
          if ((tsTime === null) && (ts.type === FieldType.time)) {
            // The index is stored alongside the ts because it has potential to be shared
            // and if so, only has to be calculated once.
            tsTime = {valuesIndex: null, values: ts.values};
            if (tsTime.values.length > 0) {
              const maxInd = tsTime.values.length - 1;
              dataTimeMin = Math.min(dataTimeMin ?? tsTime.values[0], tsTime.values[0]);
              dataTimeMax = Math.max(dataTimeMax ?? tsTime.values[maxInd], tsTime.values[maxInd]);
            }
          }
          else {
            const name = applyNamespace(getFieldDisplayName(ts, frame));
            const labels = new Map<string, string>();
            const aggregations = new Map<string, number>();
            if (ts.labels) {
              for ( const [key, value] of Object.entries(ts.labels)) {
                if ( typeof value === 'string' ) {
                  labels.set(key,value)
                }
              }
            }
            if (ts.state) {
              let src = undefined;
              if (ts.state.calcs != undefined) {
                src = ts.state.calcs
              }
              else if (ts.state.range != undefined ) {
                src = ts.state.range
              }
              if( src != undefined ) {
                for ( const [key, value] of Object.entries(src)) {
                  if ( typeof value === 'number' ) {
                    aggregations.set(key,value)
                  }
                }
              }
            }

            tsNamed[name] = {values: ts.values, time: null, labels: labels, aggregations: aggregations};
          }
        });
      }
      // Embed a time shallow copy against each ts in the frame and export to holder
      tsTime = tsTime || {values: [0], valuesIndex: null};
      for (const [name, ts] of Object.entries<any>(tsNamed)) {
          ts.time = tsTime;
          timeSeries.set(name, ts);
      }
    }
  });
  dataTimeMin = Math.floor(dataTimeMin ?? panelTimeMin ?? 0);
  dataTimeMax = Math.ceil(dataTimeMax ?? panelTimeMax ?? 0);

  let timeMin = Math.floor(panelTimeMin ?? dataTimeMin ?? 0);
  timeMin = Math.min(timeMin, dataTimeMin ?? timeMin);
  let timeMax = Math.ceil(panelTimeMax ?? dataTimeMax ?? 0);
  timeMax = Math.max(timeMax, dataTimeMax ?? timeMax);
  
  // Detect holes in each timeseries
  timeSeries.forEach((ts) => {
    const holeInfo = detectHoles(ts, queryIntervalMs);
    ts.time.hasHoles = holeInfo.hasHoles;
    ts.time.holeThreshold = holeInfo.holeThreshold;
  });

  return {
    timeMin: timeMin,           // Panel time range (for field of view)
    timeMax: timeMax,           // Panel time range (for field of view)
    timeRange: timeMax - timeMin,
    dataTimeMin: dataTimeMin,   // Actual data time range (for validation)
    dataTimeMax: dataTimeMax,   // Actual data time range (for validation)
    queryIntervalMs: queryIntervalMs,
    ts: timeSeries,
  };
}

// This receives the timeSlider position and uses it to interpolate the time-series
// data.
export function seriesInterpolate(tsData: TimeSeriesData, timeSliderScalar: number) {
  const targetTime = sliderTime(tsData, timeSliderScalar);

  tsData.ts.forEach((ts) => {
    // Each timeseries must calculate its own valuesIndex based on its own time values
    // to handle cases where timeseries have different lengths
    if (ts.time.valuesIndex === null || typeof ts.time.valuesIndex === 'undefined') {
      let closestDeltaTime = null;
      let closestIndex = null;

      // Guess first position based on a ts with linear time progression
      const maxInd = ts.time.values.length - 1;
      if (maxInd >= 0) {
        const minTime = ts.time.values[0];
        const maxTime = ts.time.values[maxInd];
        if( targetTime < minTime || targetTime > maxTime ) {
          ts.time.valuesIndex = null;
          ts.time.inHole = true;
          ts.time.targetTime = targetTime;
        } else {
          let targetInd = (maxInd * (targetTime - minTime) / (maxTime - minTime)) || 0;
          targetInd = Math.max(0, Math.min(maxInd, Math.ceil(targetInd)));
          const nudge = ts.time.values[targetInd] < targetTime ? 1 : -1;

          while ((targetInd >= 0) && (targetInd  <= maxInd)) {
            // check for holes - if we have holes and we're before the current targetInd time, check if the gap from the previous time is larger than the hole threshold. If so, break out of the loop since we know we won't find a valid point before this gap.
            if( ts.time.hasHoles && targetTime < ts.time.values[targetInd] ) {
              if(targetInd> 0 && (ts.time.values[targetInd] - ts.time.values[targetInd-1] > ts.time.holeThreshold!)) {
                ts.time.inHole = true;
                ts.time.targetTime = targetTime;
                break;
              }
            }
            ts.time.inHole = false;
            const time = ts.time.values[targetInd];
            const deltaTime = targetTime - time;
            const deltaTimeAbs = Math.abs(deltaTime);
            if ((closestDeltaTime == null) || (deltaTimeAbs < closestDeltaTime)) {
              closestDeltaTime = deltaTimeAbs;
              closestIndex = targetInd;
            }
            // Break out once we start getting worse OR if we found an exact match
            if ((deltaTimeAbs > closestDeltaTime) || (deltaTimeAbs === 0)) {
              break;
            }
            targetInd += nudge;
          }
        }
      }
      ts.time.valuesIndex = closestIndex;
    }
  });
  return tsData;
}

export function computeAndAttachSeriesStats(
  frames: DataFrame[]
): SeriesStats[] {
  return frames.map(frame => {
    const valueField = frame.fields.find(f => f.type === FieldType.number);
    if (!valueField) {
      return {};
    }

    const calcs = reduceField({
      field: valueField,
      reducers: [
        ReducerID.lastNotNull,
        ReducerID.min,
        ReducerID.max,
        ReducerID.mean,
      ],
    });

    valueField.state = valueField.state ?? {};
    valueField.state.calcs = {
      ...(valueField.state.calcs ?? {}),
      ...calcs,
    };

    return calcs as SeriesStats;
  });
}