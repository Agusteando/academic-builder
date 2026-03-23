import { computed, ref, watch } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  watch(() => selections.palette, () => { customColors.value = {}; });

  /* --- Función Robusta de Extracción de Datos --- */
  const fetchValue = (sh, p, sb, g, data) => {
    const pData = data.sheets[sh]?.periods?.find(x => x.name === p);
    if (!pData) return null;
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    if (sb !== '__avg__') {
      const sbData = pData.subjects.find(x => x.name === sb);
      if (!sbData) return null;
      if (g !== 'avg') {
        const vals = sbData.grades[g];
        return Array.isArray(vals) && vals.length ? avg(vals) : null;
      } else {
        const allNum = Object.keys(sbData.grades).filter(k => /^\d+$/.test(k));
        const vals = allNum.map(k => sbData.grades[k + '_avg']).filter(v => typeof v === 'number');
        return vals.length ? avg(vals) : null;
      }
    } else {
      if (g !== 'avg') {
        const vals = pData.subjects.map(subj => {
          const val = subj.grades[g];
          return Array.isArray(val) && val.length ? avg(val) : null;
        }).filter(v => v !== null);
        return vals.length ? avg(vals) : null;
      } else {
        const vals = pData.subjects.map(subj => {
          const allNum = Object.keys(subj.grades).filter(k => /^\d+$/.test(k));
          const subjAvg = allNum.map(k => subj.grades[k + '_avg']).filter(v => typeof v === 'number');
          return subjAvg.length ? avg(subjAvg) : null;
        }).filter(v => v !== null);
        return vals.length ? avg(vals) : null;
      }
    }
  };

  const chartOptions = computed(() => {
    if (!rawData.value || selections.sheets.length === 0 || selections.periods.length === 0) return null;

    const { sheets, periods, subjects: subsRaw, grades: gradesRaw, grouping, chartType, palette, barGap, categoryGap } = selections;
    const currentPalette = PALETTES[palette].colours;

    /* 1. Normalizar Grados */
    let actualGrades = [...gradesRaw];
    const allNumeric = new Set();
    if (actualGrades.includes('all')) {
      sheets.forEach(sh => (rawData.value.sheets[sh].periods || []).forEach(p => p.subjects.forEach(sb => {
        Object.keys(sb.grades).forEach(k => { if (/^\d+$/.test(k)) allNumeric.add(k); });
      })));
      actualGrades = Array.from(allNumeric).sort((a, b) => Number(a) - Number(b));
    } else if (actualGrades.includes('avg') && actualGrades.length === 1) {
      actualGrades = ['avg'];
    }

    /* 2. Definir los Ejes y las Series (Pivote Inteligente) */
    const isXAxisGrade = grouping === 'grade';
    
    // El eje X tendrá estos identificadores internos
    let xAxisKeys = isXAxisGrade ? [...actualGrades] : [...periods];
    
    // Insertar el separador (Gap) visual si aplica
    if (isXAxisGrade) {
      const i6 = xAxisKeys.indexOf('6');
      const i7 = xAxisKeys.indexOf('7');
      if (i6 > -1 && i7 === i6 + 1) xAxisKeys.splice(i7, 0, '__sep__');
    }

    // Etiquetas legibles para el eje X
    const xAxisLabels = xAxisKeys.map(k => k === '__sep__' ? ' ' : (k === 'avg' ? 'Prom.' : (isXAxisGrade ? `G.${k}` : k)));

    /* 3. Lógica de Nombres Semánticos para Leyendas */
    const multiSheet = sheets.length > 1;
    const multiPeriod = periods.length > 1;
    const multiSubject = subsRaw.length > 1;
    const multiGrade = actualGrades.length > 1;

    const buildSeriesName = (sh, p, sb, g) => {
      const parts = [];
      if (multiSheet) parts.push(sh.split(' ')[0]); // "TOLUCA 2025" -> "TOLUCA"
      if (multiPeriod && isXAxisGrade) parts.push(p);
      if (multiSubject) parts.push(sb === '__avg__' ? 'Promedio Gral' : sb);
      if (!isXAxisGrade && multiGrade) parts.push(g === 'avg' ? 'Prom. Grados' : `Grado ${g}`);
      return parts.length ? parts.join(' | ') : (multiSheet ? sh.split(' ')[0] : (sb === '__avg__' ? 'General' : sb));
    };

    /* 4. Construir las Series Iterando Combinaciones */
    const seriesMap = new Map();

    const getSeriesKey = (sh, p, sb, g) => isXAxisGrade ? `${sh}|${p}|${sb}` : `${sh}|${sb}|${g}`;

    sheets.forEach(sh => {
      periods.forEach(p => {
        subsRaw.forEach(sb => {
          actualGrades.forEach(g => {
            const val = fetchValue(sh, p, sb, g, rawData.value);
            if (val === null && !seriesMap.has(getSeriesKey(sh, p, sb, g))) return; // Saltar vacíos si la serie no existe aún

            const seriesKey = getSeriesKey(sh, p, sb, g);
            const xIndex = isXAxisGrade ? xAxisKeys.indexOf(g) : xAxisKeys.indexOf(p);
            
            if (!seriesMap.has(seriesKey)) {
              seriesMap.set(seriesKey, {
                name: buildSeriesName(sh, p, sb, g),
                data: new Array(xAxisKeys.length).fill(null)
              });
            }

            // Guardamos el valor Y, pero en formato de objeto para inyectar Metadata al Tooltip
            if (val !== null) {
              seriesMap.get(seriesKey).data[xIndex] = {
                value: Number(val.toFixed(2)),
                meta: { plantel: sh, periodo: p, materia: sb === '__avg__' ? 'Promedio General' : sb, grado: g === 'avg' ? 'Promedio' : g }
              };
            }
          });
        });
      });
    });

    /* 5. Calcular Límites y Formatear para ECharts */
    const series = [];
    let colorIdx = 0;
    let minY = Infinity; let maxY = -Infinity;

    seriesMap.forEach((obj, key) => {
      // Extraer solo los números para min/max
      obj.data.forEach(item => {
        if (item && typeof item.value === 'number') {
          minY = Math.min(minY, item.value); maxY = Math.max(maxY, item.value);
        }
      });

      const palObj = currentPalette[colorIdx % currentPalette.length];
      if (!customColors.value[key]) customColors.value[key] = palObj.base;
      const baseColor = customColors.value[key];
      const isCustomized = customColors.value[key] !== palObj.base;

      series.push({
        name: obj.name,
        type: chartType,
        smooth: true,
        symbolSize: chartType === 'line' ? 8 : 0,
        
        // Espaciado ajustado para comparar perfiles (Ej: Toluca pegado a Metepec)
        barGap: barGap || '5%',
        barCategoryGap: categoryGap || '30%',
        barMaxWidth: 80, // Evitar barras gigantescas si hay pocos datos
        
        itemStyle: { 
          borderRadius: chartType === 'bar' ? [5, 5, 0, 0] : 0,
          color: (chartType === 'line' || isCustomized) ? baseColor : {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: palObj.gradient[0] }, { offset: 1, color: palObj.gradient[1] }]
          }
        },
        lineStyle: { width: 3, color: baseColor },
        
        // Datalabels legibles encima
        label: {
          show: chartType === 'bar',
          position: 'top',
          distance: 5,
          backgroundColor: '#ffffff',
          borderColor: 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          borderRadius: 4,
          padding: [4, 6],
          color: '#1e293b',
          fontSize: 12,
          fontWeight: 700,
          formatter: p => p.data && p.data.value != null ? p.data.value : ''
        },
        
        data: obj.data
      });
      colorIdx++;
    });

    const yAxisMin = chartType === 'line' ? Math.max(0, Math.floor(minY - 5)) : 0;
    const yAxisMax = Math.min(100, Math.ceil(maxY + 5));

    return {
      title: { show: false },
      
      // TOOLTIP ENRIQUECIDO Y SEMÁNTICO
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' }, 
        backgroundColor: 'rgba(255, 255, 255, 0.98)', 
        borderColor: '#e2e8f0',
        padding: 0,
        textStyle: { color: '#0f172a', fontFamily: 'Inter' },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const xLabel = params[0].axisValue;
          if (xLabel === ' ') return ''; // Es el gap
          
          let html = `<div class="px-4 py-3 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">${isXAxisGrade ? 'Grado / Grupo: ' : 'Periodo: '} ${xLabel}</div>`;
          html += `<div class="p-3 space-y-2">`;
          
          params.forEach(p => {
            if (p.data && p.data.value != null) {
              const meta = p.data.meta;
              html += `
                <div class="flex flex-col text-sm border-l-4 pl-2" style="border-color: ${p.color?.colorStops ? p.color.colorStops[0].color : p.color}">
                  <span class="font-bold text-slate-800">${meta.plantel} <span class="text-brand-600 ml-1">${p.data.value}%</span></span>
                  <span class="text-xs text-slate-500">${meta.materia} ${!isXAxisGrade ? `(Grado ${meta.grado})` : ''}</span>
                </div>`;
            }
          });
          html += `</div>`;
          return html;
        }
      },
      
      legend: { type: 'scroll', top: 0, icon: 'circle', itemWidth: 12, textStyle: { color: '#475569', fontWeight: 600, fontSize: 13 } },
      grid: { left: '2%', right: '3%', bottom: '8%', top: '15%', containLabel: true },
      dataZoom: [{ type: 'slider', show: xAxisLabels.length > 12, bottom: 5, height: 20 }],
      xAxis: { type: 'category', data: xAxisLabels, axisLabel: { color: '#334155', fontWeight: 700, fontSize: 14, interval: 0 } },
      yAxis: { type: 'value', min: minY === Infinity ? 0 : yAxisMin, max: maxY === -Infinity ? 100 : yAxisMax, splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }, axisLabel: { fontWeight: 600, color: '#64748b' } },
      series
    };
  });

  return { chartOptions, customColors, seriesDict: computed(() => seriesMap) };
}