import { computed, ref, watch } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  // Resetear colores personalizados si el usuario cambia de paleta global
  watch(() => selections.palette, () => { customColors.value = {}; });

  const chartOptions = computed(() => {
    if (!rawData.value || selections.sheets.length === 0 || selections.periods.length === 0) return null;

    const { sheets, periods, subjects: subsRaw, grades: gradesRaw, grouping, chartType, palette, barGap, categoryGap } = selections;
    const currentPalette = PALETTES[palette].colours;

    /* 1. Expandir Grados */
    let actualGrades = [...gradesRaw];
    const allNumeric = new Set();
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

    /* 2. Separador visual entre grados 6 y 7 */
    let gradesWithSep = [...actualGrades];
    if (grouping === 'grade') {
      const i6 = gradesWithSep.indexOf('6');
      const i7 = gradesWithSep.indexOf('7');
      if (i6 > -1 && i7 === i6 + 1) { gradesWithSep.splice(i7, 0, '__sep__'); }
    }

    const useAvgSubject = subsRaw.includes('__avg__');
    const specificSubjects = subsRaw.filter(s => s !== '__avg__');
    const xAxisLabels = grouping === 'period' ? periods : gradesWithSep.map(g => g === '__sep__' ? ' ' : (g === 'avg' ? 'Prom.' : g));

    /* 3. Recolectar Datos */
    const seriesDict = {};
    const addData = (key, label, dim, val) => {
      if (!seriesDict[key]) seriesDict[key] = { name: label, dataMap: {} };
      seriesDict[key].dataMap[dim] = val;
    };
    const getAvg = arr => arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    sheets.forEach(sh => {
      (rawData.value.sheets[sh].periods || []).filter(p => periods.includes(p.name)).forEach(p => {
        const pSubj = p.subjects;
        const pKeys = [...new Set(pSubj.flatMap(sb => Object.keys(sb.grades).filter(k => /^\d+$/.test(k))))];

        const calcValue = (sbArr, g) => {
          if (g === 'avg') return getAvg(sbArr.flatMap(sb => pKeys.map(k => sb.grades[k + "_avg"]).filter(v => typeof v === 'number')));
          return getAvg(sbArr.flatMap(sb => Array.isArray(sb.grades[g]) ? [getAvg(sb.grades[g])] : []));
        };

        if (useAvgSubject) {
          actualGrades.forEach(g => {
            addData(`${sh}-avg-${g}`, `${sh} | Promedio Gral | ${g === 'avg' ? 'Prom.' : 'G.' + g}`, grouping === 'period' ? p.name : g, calcValue(pSubj, g));
          });
        }

        pSubj.filter(sb => specificSubjects.includes(sb.name)).forEach(sb => {
          actualGrades.forEach(g => {
            let y = g === 'avg' ? getAvg(pKeys.map(k => sb.grades[k + "_avg"]).filter(v => typeof v === 'number')) : (Array.isArray(sb.grades[g]) ? getAvg(sb.grades[g]) : null);
            addData(`${sh}-${sb.name}-${g}`, `${sh} | ${sb.name} | ${g === 'avg' ? 'Prom.' : 'G.' + g}`, grouping === 'period' ? p.name : g, y);
          });
        });
      });
    });

    /* 4. Construir Series con Gradientes y DataLabels Legacy */
    const series = [];
    let colorIdx = 0;
    let minY = Infinity; let maxY = -Infinity;

    Object.entries(seriesDict).forEach(([key, obj]) => {
      const data = (grouping === 'period' ? periods : gradesWithSep).map(dim => {
        if (dim === '__sep__') return null;
        const val = obj.dataMap[grouping === 'period' ? dim : (dim === 'avg' ? 'avg' : dim)];
        if (val != null) { minY = Math.min(minY, val); maxY = Math.max(maxY, val); return Number(val.toFixed(2)); }
        return null;
      });
      
      const palObj = currentPalette[colorIdx % currentPalette.length];
      if (!customColors.value[key]) customColors.value[key] = palObj.base;
      
      const isCustomized = customColors.value[key] !== palObj.base;
      const baseColor = customColors.value[key];

      series.push({
        name: obj.name,
        type: chartType,
        smooth: true,
        symbolSize: chartType === 'line' ? 10 : 0,
        
        // CONTROLES DE ESPACIADO DINÁMICOS
        barGap: barGap,
        barCategoryGap: categoryGap,
        
        itemStyle: { 
          borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0,
          // Recreando el createLinearGradient del código legacy
          color: (chartType === 'line' || isCustomized) ? baseColor : {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: palObj.gradient[0] }, { offset: 1, color: palObj.gradient[1] }]
          }
        },
        lineStyle: { width: 3, color: baseColor },
        
        // DATALABELS ESTILO LEGACY (Cajas blancas sobre barras)
        label: {
          show: chartType === 'bar',
          position: 'top',
          distance: 8,
          backgroundColor: '#ffffff',
          borderColor: 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          borderRadius: 4,
          padding: [5, 7],
          color: '#374151',
          fontSize: 12,
          fontWeight: 'bold',
          formatter: (p) => p.value != null ? p.value : ''
        },
        
        data
      });
      colorIdx++;
    });

    const yAxisMin = chartType === 'line' ? Math.max(0, Math.floor(minY - 5)) : 0;
    const yAxisMax = Math.min(100, Math.ceil(maxY + 5));

    return {
      title: { show: false },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(255, 255, 255, 0.95)', textStyle: { color: '#0f172a' } },
      legend: { type: 'scroll', top: 0, icon: 'roundRect', itemWidth: 14, textStyle: { color: '#334155', fontWeight: 500 } },
      grid: { left: '2%', right: '3%', bottom: '8%', top: '15%', containLabel: true },
      dataZoom: [{ type: 'slider', show: series[0]?.data?.length > 10, bottom: 5, height: 20 }],
      xAxis: { type: 'category', data: xAxisLabels, axisLabel: { color: '#334155', fontWeight: 600, fontSize: 13, interval: 0 } },
      yAxis: { type: 'value', min: minY === Infinity ? 0 : yAxisMin, max: maxY === -Infinity ? 100 : yAxisMax, splitLine: { lineStyle: { type: 'dashed' } } },
      series
    };
  });

  return { chartOptions, customColors, seriesDict: computed(() => seriesDict) };
}