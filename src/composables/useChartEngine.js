import { computed, ref } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  const chartOptions = computed(() => {
    if (!rawData.value || selections.sheets.length === 0 || selections.periods.length === 0) return null;

    const { sheets, periods, subjects: subsRaw, grades: gradesRaw, grouping, chartType, palette } = selections;
    const baseColors = PALETTES[palette].colors;

    // 1. Resolve Grades
    let actualGrades = [...gradesRaw];
    const allNumeric = new Set();
    // Gather all numeric grades if needed
    if (actualGrades.includes('all')) {
      sheets.forEach(sh => {
        (rawData.value.sheets[sh].periods || []).forEach(p => p.subjects.forEach(sb => {
          Object.keys(sb.grades).forEach(k => { if (/^\d+$/.test(k)) allNumeric.add(k); });
        }));
      });
      actualGrades = Array.from(allNumeric).sort((a, b) => Number(a) - Number(b));
    } else if (actualGrades.includes('avg') && actualGrades.length === 1) {
      actualGrades = ['avg'];
    }

    const useAvgSubject = subsRaw.includes('__avg__');
    const specificSubjects = subsRaw.filter(s => s !== '__avg__');

    const xAxisLabels = grouping === 'period' ? periods : actualGrades.map(g => g === 'avg' ? 'Prom.' : g);
    const seriesDict = {};

    const addData = (key, label, dim, val) => {
      if (!seriesDict[key]) seriesDict[key] = { name: label, dataMap: {} };
      seriesDict[key].dataMap[dim] = val;
    };

    const getAvg = arr => arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // 2. Map Data
    sheets.forEach(sh => {
      (rawData.value.sheets[sh].periods || []).filter(p => periods.includes(p.name)).forEach(p => {
        const pSubj = p.subjects;
        const pKeys = [...new Set(pSubj.flatMap(sb => Object.keys(sb.grades).filter(k => /^\d+$/.test(k))))];

        const calcValue = (sbArr, g) => {
          if (g === 'avg') {
            const vals = sbArr.flatMap(sb => pKeys.map(k => sb.grades[k + "_avg"]).filter(v => typeof v === 'number'));
            return getAvg(vals);
          }
          const vals = sbArr.flatMap(sb => Array.isArray(sb.grades[g]) ? [getAvg(sb.grades[g])] : []);
          return getAvg(vals);
        };

        if (useAvgSubject) {
          actualGrades.forEach(g => {
            const y = calcValue(pSubj, g);
            const dim = grouping === 'period' ? p.name : g;
            const lbl = `${sh} | Promedio Gral | ${g === 'avg' ? 'Prom.' : 'G.' + g}`;
            addData(`${sh}-avg-${g}`, lbl, dim, y);
          });
        }

        pSubj.filter(sb => specificSubjects.includes(sb.name)).forEach(sb => {
          actualGrades.forEach(g => {
            let y;
            if (g === 'avg') {
              y = getAvg(pKeys.map(k => sb.grades[k + "_avg"]).filter(v => typeof v === 'number'));
            } else {
              y = Array.isArray(sb.grades[g]) ? getAvg(sb.grades[g]) : null;
            }
            const dim = grouping === 'period' ? p.name : g;
            const lbl = `${sh} | ${sb.name} | ${g === 'avg' ? 'Prom.' : 'G.' + g}`;
            addData(`${sh}-${sb.name}-${g}`, lbl, dim, y);
          });
        });
      });
    });

    // 3. Build ECharts Series
    const series = [];
    let colorIdx = 0;

    Object.entries(seriesDict).forEach(([key, obj]) => {
      const data = xAxisLabels.map(dim => {
        const val = obj.dataMap[grouping === 'period' ? dim : (dim === 'Prom.' ? 'avg' : dim)];
        return val !== null && val !== undefined ? Number(val.toFixed(2)) : null;
      });
      
      // Auto-assign color or use override
      if (!customColors.value[key]) customColors.value[key] = baseColors[colorIdx % baseColors.length];
      
      series.push({
        name: obj.name,
        type: chartType,
        smooth: true,
        symbolSize: 8,
        barGap: '15%',
        itemStyle: { borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0, color: customColors.value[key] },
        emphasis: { focus: 'series' },
        data
      });
      colorIdx++;
    });

    // 4. ECharts Config Object
    return {
      title: { show: false }, // Handled via HTML for better DOM layout
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: chartType === 'bar' ? 'shadow' : 'cross' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#1e293b' },
        padding: [12, 16],
        valueFormatter: (value) => value === null ? 'Sin datos' : value + '%'
      },
      legend: {
        type: 'scroll',
        top: 0,
        icon: 'circle',
        itemWidth: 10,
        textStyle: { color: '#475569', fontFamily: 'Inter' }
      },
      grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          saveAsImage: { name: 'Reporte_Academico', pixelRatio: 2 },
          dataView: { readOnly: true }
        }
      },
      xAxis: {
        type: 'category',
        data: xAxisLabels,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', fontFamily: 'Inter', fontWeight: 500 }
      },
      yAxis: {
        type: 'value',
        name: 'Promedio (%)',
        nameTextStyle: { color: '#64748b', padding: [0, 0, 0, 20] },
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontFamily: 'Inter' }
      },
      series
    };
  });

  return { chartOptions, customColors, seriesDict: computed(() => seriesDict) };
}