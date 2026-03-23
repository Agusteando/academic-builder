import { computed, ref } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  const chartOptions = computed(() => {
    if (!rawData.value || selections.sheets.length === 0 || selections.periods.length === 0) return null;

    const { sheets, periods, subjects: subsRaw, grades: gradesRaw, grouping, chartType, palette } = selections;
    const baseColors = PALETTES[palette].colors;

    /* ──────────────────────────────────────────────────────────────────────
     * 1. EXPANDIR GRADOS Y CREAR SEPARADORES VISUALES
     * ─────────────────────────────────────────────────────────────────── */
    let actualGrades = [...gradesRaw];
    const allNumeric = new Set();
    
    // Resolver "all" a números reales
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

    // Insertar el separador visual (Gap) entre el grado 6 y 7 si agrupamos por grado
    let gradesWithSep = [...actualGrades];
    if (grouping === 'grade') {
      const i6 = gradesWithSep.indexOf('6');
      const i7 = gradesWithSep.indexOf('7');
      if (i6 > -1 && i7 === i6 + 1) {
        gradesWithSep.splice(i7, 0, '__sep__');
      }
    }

    const useAvgSubject = subsRaw.includes('__avg__');
    const specificSubjects = subsRaw.filter(s => s !== '__avg__');

    // Eje X: Manejar el espacio en blanco del separador
    const xAxisLabels = grouping === 'period' 
      ? periods 
      : gradesWithSep.map(g => g === '__sep__' ? ' ' : (g === 'avg' ? 'Prom.' : g));

    /* ──────────────────────────────────────────────────────────────────────
     * 2. RECOLECTAR Y NORMALIZAR DATOS
     * ─────────────────────────────────────────────────────────────────── */
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
            const lbl = `${sh} | Promedio Gral | ${g === 'avg' ? 'Prom.' : 'Grado ' + g}`;
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
            const lbl = `${sh} | ${sb.name} | ${g === 'avg' ? 'Prom.' : 'Grado ' + g}`;
            addData(`${sh}-${sb.name}-${g}`, lbl, dim, y);
          });
        });
      });
    });

    /* ──────────────────────────────────────────────────────────────────────
     * 3. CONSTRUIR SERIES Y CALCULAR LÍMITES DINÁMICOS (Min/Max)
     * ─────────────────────────────────────────────────────────────────── */
    const series = [];
    let colorIdx = 0;
    let minY = Infinity;
    let maxY = -Infinity;

    Object.entries(seriesDict).forEach(([key, obj]) => {
      const data = (grouping === 'period' ? periods : gradesWithSep).map(dim => {
        if (dim === '__sep__') return null; // Respetar el gap
        
        const mapKey = grouping === 'period' ? dim : (dim === 'avg' ? 'avg' : dim);
        const val = obj.dataMap[mapKey];
        
        if (val != null) {
          minY = Math.min(minY, val);
          maxY = Math.max(maxY, val);
          return Number(val.toFixed(2));
        }
        return null;
      });
      
      if (!customColors.value[key]) customColors.value[key] = baseColors[colorIdx % baseColors.length];
      
      series.push({
        name: obj.name,
        type: chartType,
        smooth: true,
        symbolSize: 8,
        
        // Ajustes finos de barras para comparación (emula el grosor del legacy)
        barGap: '10%',
        barCategoryGap: '20%',
        barMaxWidth: 60,
        
        itemStyle: { 
          borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0, 
          color: customColors.value[key] 
        },
        
        // ¡DATALABELS VISIBLES!
        label: {
          show: chartType === 'bar',
          position: 'top',
          color: '#334155',
          fontSize: 12,
          fontWeight: 600,
          formatter: (params) => params.value !== null && params.value !== undefined ? params.value : ''
        },
        
        emphasis: { focus: 'series' },
        data
      });
      colorIdx++;
    });

    // Calcular límites Y dinámicos igual que el legacy (+/- 5 de margen)
    const yAxisMin = chartType === 'line' ? Math.max(0, Math.floor(minY - 5)) : 0;
    const yAxisMax = Math.min(100, Math.ceil(maxY + 5));

    /* ──────────────────────────────────────────────────────────────────────
     * 4. CONFIGURACIÓN FINAL DE ECHARTS
     * ─────────────────────────────────────────────────────────────────── */
    return {
      title: { show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: chartType === 'bar' ? 'shadow' : 'cross' },
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: '#0f172a', fontSize: 13 },
        padding: [12, 16],
        valueFormatter: (value) => value === null ? 'Sin datos' : value + '%'
      },
      legend: {
        type: 'scroll',
        top: 0,
        icon: 'circle',
        itemWidth: 12,
        itemGap: 16,
        textStyle: { color: '#334155', fontFamily: 'Inter', fontWeight: 500, fontSize: 12 }
      },
      // Margen interior ajustado para acomodar datalabels y legend
      grid: { left: '2%', right: '3%', bottom: '8%', top: '15%', containLabel: true },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Reset Zoom' } },
          saveAsImage: { name: 'Reporte_Academico', pixelRatio: 2, title: 'Guardar PNG' },
        }
      },
      // Útil para cuando hay muchísimos datos
      dataZoom: [
        { type: 'slider', show: series[0]?.data?.length > 15, bottom: 5, height: 20 }
      ],
      xAxis: {
        type: 'category',
        data: xAxisLabels,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { 
          color: '#334155', 
          fontFamily: 'Inter', 
          fontWeight: 600,
          fontSize: 13,
          interval: 0 // Forzar a que muestre todos los labels
        }
      },
      yAxis: {
        type: 'value',
        name: 'Promedio (%)',
        nameTextStyle: { color: '#64748b', fontWeight: 500, align: 'right' },
        min: minY === Infinity ? 0 : yAxisMin,
        max: maxY === -Infinity ? 100 : yAxisMax,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed', width: 2 } },
        axisLabel: { color: '#64748b', fontFamily: 'Inter', fontWeight: 500 }
      },
      series
    };
  });

  return { chartOptions, customColors, seriesDict: computed(() => seriesDict) };
}