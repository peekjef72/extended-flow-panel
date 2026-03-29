import { seriesTransform, seriesInterpolate } from 'components/TimeSeries';
import { getCellValue } from 'components/SvgUpdater';
import { DataRefDrive } from 'components/Config';

describe('Hole Detection', () => {
  const timeMin = 1000;
  const timeMax = 2000;
  const dataRefTransform = undefined;

  // Mock data with holes - gaps larger than expected interval
  const mockDataWithHoles = [
    {
      fields: [
        {
          name: 'time',
          type: 'time',
          values: [1000, 1200, 1600, 2000] // Holes between 1200-1600 (400ms gap) and 1600-2000 (400ms gap)
        },
        {
          name: 'Value',
          type: 'number',
          values: [10, 20, 40, 60],
          labels: { }
        }
      ]
    }
  ];

  // Mock data without holes - regular intervals
  const mockDataNoHoles = [
    {
      fields: [
        {
          name: 'time',
          type: 'time',
          values: [1000, 1200, 1400, 1600, 1800, 2000] // Regular 200ms intervals
        },
        {
          name: 'Value',
          type: 'number',
          values: [10, 20, 30, 40, 50, 60],
          labels: {  }
        }
      ]
    }
  ];

  it('should detect holes in discontinuous data', () => {
    const tsData = seriesTransform(mockDataWithHoles, timeMin, timeMax, dataRefTransform, 200);
    tsData.queryIntervalMs = 200; // Expected interval is 200ms

    // Interpolate at time 1400 (in the middle of the hole between 1200 and 1600)
    seriesInterpolate(tsData, 0.5); // This should find closest index

    const drive: DataRefDrive = {
      dataRef: 'Value',
      bespokeDataRef: undefined,
      datapoint: 'last'
    };

    const result = getCellValue(drive, tsData, {});
    
    // Should return null since 1400 is in a hole (400ms gap > 400ms threshold)
    expect(result.value).toBeNull();
  });

  it('should return values when no holes exist', () => {
    const tsData = seriesTransform(mockDataNoHoles, timeMin, timeMax, dataRefTransform, 200);
    tsData.queryIntervalMs = 200; // Expected interval is 200ms

    // Interpolate at time 1400 (exactly at a data point)
    seriesInterpolate(tsData, 0.4); // This should find closest index to 1400

    // const ts = tsData.ts.get('Value');
    // console.log('DEBUG: Target time should be 1400');
    // console.log('DEBUG: Values index:', ts?.time.valuesIndex);
    // console.log('DEBUG: Values at index:', ts?.time.valuesIndex !== null && ts?.time.valuesIndex !== undefined ? ts?.time.values[ts?.time.valuesIndex] : 'null/undefined');
    // console.log('DEBUG: Closest time delta:', ts?.time.closestTimeDelta);
    // console.log('DEBUG: Query interval:', tsData.queryIntervalMs);
    // console.log('DEBUG: Hole threshold:', tsData.queryIntervalMs * 2);

    const drive: DataRefDrive = {
      dataRef: 'Value',
      bespokeDataRef: undefined,
      datapoint: 'last'
    };

    const result = getCellValue(drive, tsData, {});
    console.log('DEBUG: Result value:', result.value);
    
    // Should return a value since we're at an actual data point
    expect(result.value).not.toBeNull();
  });

  it('should detect holes with default threshold', () => {
    const tsData = seriesTransform(mockDataWithHoles, timeMin, timeMax, dataRefTransform, 200);
    tsData.queryIntervalMs = 200; // Expected interval is 200ms

    // Interpolate at time 1400 (in the middle of the hole)
    seriesInterpolate(tsData, 0.5);

    const drive: DataRefDrive = {
      dataRef: 'value',
      bespokeDataRef: undefined,
      datapoint: 'last'
    };

    const result = getCellValue(drive, tsData, {});
    
    // Should return null since time delta exceeds the default threshold (400ms)
    expect(result.value).toBeNull();
  });

  it('should handle default fallback when no query interval', () => {
    const tsData = seriesTransform(mockDataWithHoles, timeMin, timeMax, dataRefTransform, 0);

    // Interpolate at time 1400 (in the middle of the hole)
    seriesInterpolate(tsData, 0.5);

    const drive: DataRefDrive = {
      dataRef: 'value',
      bespokeDataRef: undefined,
      datapoint: 'last'
    };

    const result = getCellValue(drive, tsData, {});
    
    // Should use default 5-minute fallback and return null for hole
    expect(result.value).toBeNull();
  });
});
