import { seriesTransform, seriesInterpolate, TimeSeries, TimeSeriesData } from 'components/TimeSeries'

test('timeseries with different lengths should not cause index out of bounds', () => {
  const timeMin = 1000;
  const timeMax = 2000;
  const dataRefTransform = undefined;

  
  const mockData = [
    {
      fields: [
        {
          name: 'time',
          type: 'time',
          values: [1000, 1500, 2000, 2500, 3000]
        },
        {
          name: 'series1',
          type: 'number',
          values: [10, 20, 30, 40, 50],
          labels: { }
        }
      ]
    },{
      fields: [
        {
          name: 'time',
          type: 'time',
          values: [1000, 2000, 3000],
        },
        {
          name: 'series2',
          type: 'number',
          values: [100, 200, 300],
          labels: { }
        }
      ]
    },{
      fields: [
        {
          name: 'time',
          type: 'time',
          values: [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000]
        },
        {
          name: 'series3',
          type: 'number',
          values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          labels: { }
        }
      ]
    }
  ];
  const tsData = seriesTransform(mockData, timeMin, timeMax, dataRefTransform, 200);

  // Create timeseries with different lengths

  // Test interpolation at different slider positions
  const sliderPositions = [0, 0.25, 0.5, 0.75, 1.0];
  
  sliderPositions.forEach((sliderPos) => {
    // This should not throw an error even with different length timeseries
    seriesInterpolate(tsData, sliderPos);
    
    // Verify that each timeseries has a valid valuesIndex
    tsData.ts.forEach((ts) => {
      if (ts.time.valuesIndex !== null && ts.time.valuesIndex !== undefined) {
        // Ensure the index is within bounds
        expect(ts.time.valuesIndex).toBeGreaterThanOrEqual(0);
        expect(ts.time.valuesIndex).toBeLessThan(ts.values.length);
        
        // Ensure we can safely access the value at that index
        expect(() => {
          const value = ts.values[ts.time.valuesIndex!];
          expect(value).toBeDefined();
        }).not.toThrow();
        ts.time.valuesIndex = null; // Reset for next iteration
      }
    });
  });
});

test('timeseries with single data point should work correctly', () => {
  const tsData: TimeSeriesData = {
    timeMin: 1000,
    timeMax: 3000,
    timeRange: 2000,
    dataTimeMin: 1000,
    dataTimeMax: 3000,
    queryIntervalMs: 500,
    ts: new Map<string, TimeSeries>(),
  };

  const ts: TimeSeries = {
    time: {values: [2000]},
    values: [42],
    labels: new Map(),
    aggregations: new Map(),
  };

  tsData.ts.set('singlePoint', ts);

  // Test interpolation
  seriesInterpolate(tsData, 0.5);
  
  // Should have valuesIndex of 0
  expect(ts.time.valuesIndex).toBe(0);
  expect(ts.values[ts.time.valuesIndex!]).toBe(42);
});

test('timeseries with empty data should handle gracefully', () => {
  const tsData: TimeSeriesData = {
    timeMin: 1000,
    timeMax: 3000,
    timeRange: 2000,
    dataTimeMin: 1000,
    dataTimeMax: 3000,
    queryIntervalMs: 500,
    ts: new Map<string, TimeSeries>(),
  };

  const ts: TimeSeries = {
    time: {values: []},
    values: [],
    labels: new Map(),
    aggregations: new Map(),
  };

  tsData.ts.set('empty', ts);

  // Test interpolation
  seriesInterpolate(tsData, 0.5);
  
  // Should have valuesIndex of null for empty timeseries
  expect(ts.time.valuesIndex).toBeNull();
});
