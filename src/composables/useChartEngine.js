import { computed, ref, watch } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  // Reset custom colors if the overall palette is changed
  watch(() => selections.palette, () => { customColors.value = {}; });

  /* --- Data Extraction Logic --- */
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
    const isXAxisGrade = grouping === 'grade';

    /* 1. Normalizar Grados a testear para ignorar categorías completamente vacías */
    let gradesToTest = new Set();
    gradesRaw.forEach(g => {
      if (g === 'all') {
        sheets.forEach(sh => {
          (rawData.value.sheets[sh].periods || []).forEach(per => {
            per.subjects.forEach(subj => {
              Object.keys(subj.grades).forEach(k => { if (/^\d+$/.test(k)) gradesToTest.add(k); });
            });
          });
        });
      } else {
        gradesToTest.add(g);
      }
    });
    gradesToTest = Array.from(gradesToTest);

    /* 2. Extraer los puntos de datos válidos y Agruparlos Semánticamente */
    const validXKeys = new Set();
    const groups = new Map();
    let minY = Infinity;
    let maxY = -Infinity;

    sheets.forEach(sh => {
      periods.forEach(p => {
        subsRaw.forEach(sb => {
          gradesToTest.forEach(g => {
            const val = fetchValue(sh, p, sb, g, rawData.value);
            if (val === null) return; // Omitir datos nulos

            const xCat = isXAxisGrade ? g : p;
            validXKeys.add(xCat);

            // Generar el nombre de la Agrupación Principal (lo que se mostrará en Legend y compartirá el mismo tono de color)
            let groupName = sh; 
            if (sheets.length === 1) {
              if (subsRaw.length > 1) groupName = sb === '__avg__' ? 'Promedio Gral' : sb;
              else if (periods.length > 1) groupName = p;
              else groupName = sh.split(' ')[0];
            } else {
              groupName = sh.split(' ')[0];
              if (isXAxisGrade && periods.length > 1) groupName += ` | ${p}`;
            }

            if (!groups.has(groupName)) groups.set(groupName, new Map());
            const catMap = groups.get(groupName);
            if (!catMap.has(xCat)) catMap.set(xCat, []);

            // Insertar el punto de datos válido en su categoría respectiva dentro de su grupo principal
            catMap.get(xCat).push({
              value: Number(val.toFixed(2)),
              meta: { plantel: sh, periodo: p, materia: sb === '__avg__' ? 'Promedio General' : sb, grado: g === 'avg' ? 'Promedio' : g }
            });

            minY = Math.min(minY, val);
            maxY = Math.max(maxY, val);
          });
        });
      });
    });

    if (validXKeys.size === 0) return null;

    /* 3. Definir el X-Axis Estricto e Inserción de Brecha (Gap) Visual */
    let xAxisKeys = Array.from(validXKeys);
    if (isXAxisGrade) {
      xAxisKeys.sort((a, b) => (a === 'avg' ? 1 : (b === 'avg' ? -1 : Number(a) - Number(b))));
    } else {
      xAxisKeys = periods.filter(p => validXKeys.has(p));
    }

    let finalXAxis = [];
    let xAxisLabels = [];
    for (let i = 0; i < xAxisKeys.length; i++) {
      finalXAxis.push(xAxisKeys[i]);
      xAxisLabels.push(xAxisKeys[i] === 'avg' ? 'Prom.' : (isXAxisGrade ? `G.${xAxisKeys[i]}` : xAxisKeys[i]));
      
      // Separador duro entre grados 6 y 7
      if (isXAxisGrade && xAxisKeys[i] === '6' && xAxisKeys.includes('7')) {
        finalXAxis.push('__sep__');
        xAxisLabels.push(' ');
      }
    }

    /* 4. Algoritmo Inteligente de Sombras de Color */
    const generateShade = (hex, factor) => {
      if (!hex || !hex.startsWith('#')) return hex;
      let r = parseInt(hex.slice(1,3), 16);
      let g = parseInt(hex.slice(3,5), 16);
      let b = parseInt(hex.slice(5,7), 16);
      
      r = Math.min(255, Math.max(0, Math.round(r + (factor > 0 ? (255-r)*factor : r*factor))));
      g = Math.min(255, Math.max(0, Math.round(g + (factor > 0 ? (255-g)*factor : g*factor))));
      b = Math.min(255, Math.max(0, Math.round(b + (factor > 0 ? (255-b)*factor : b*factor))));
      
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    };

    /* 5. Motor de Empaquetado de Datos (Dynamic Packing Engine) para eliminar barras vacías (Gaps) */
    const series = [];
    let groupColorIdx = 0;

    groups.forEach((catMap, groupName) => {
      // Calcular la cantidad MÁXIMA de barras simultáneas (Ej: 3 materias distintas) que este Grupo tiene en una misma categoría del X-Axis.
      let maxPoints = 0;
      catMap.forEach(points => { if (points.length > maxPoints) maxPoints = points.length; });

      // Generar 'maxPoints' sub-series para ECharts para este grupo, garantizando cero huecos internos.
      const subSeriesArrays = Array.from({ length: maxPoints }, () => new Array(finalXAxis.length).fill(null));

      finalXAxis.forEach((xCat, xIdx) => {
        if (xCat === '__sep__') return;
        const points = catMap.get(xCat) || [];
        
        // Ordenamos alfabéticamente para asegurar consistencia cromática por materia
        points.sort((a, b) => a.meta.materia.localeCompare(b.meta.materia));
        
        points.forEach((pt, ptIdx) => {
          subSeriesArrays[ptIdx][xIdx] = pt;
        });
      });

      // Asignación de Color Base de la Entidad Principal
      const palObj = currentPalette[groupColorIdx % currentPalette.length];
      if (!customColors.value[groupName]) customColors.value[groupName] = palObj.base;
      const baseColor = customColors.value[groupName];

      subSeriesArrays.forEach((dataArr, idx) => {
        // Distribuimos la sombra: de +25% de luz a -25% de sombra
        const factor = maxPoints === 1 ? 0 : 0.25 - (idx * (0.5 / (maxPoints - 1)));
        const itemColor = generateShade(baseColor, factor);

        series.push({
          name: groupName, // Todas las sub-series comparten el nombre para fusionarse en el mismo 'Toggle' de Legend
          type: chartType,
          smooth: true,
          barGap: barGap || '15%',
          barCategoryGap: categoryGap || '30%',
          itemStyle: {
            borderRadius: chartType === 'bar' ? [5, 5, 0, 0] : 0,
            color: itemColor
          },
          lineStyle: { width: 3, color: itemColor },
          label: {
            show: chartType === 'bar',
            position: 'top',
            distance: 5,
            color: '#1e293b',
            fontSize: 12,
            fontWeight: 700,
            formatter: p => p.data && p.data.value != null ? p.data.value : ''
          },
          data: dataArr
        });
      });

      groupColorIdx++;
    });

    /* 6. Recorte Inteligente (Cropping) del Y-Axis */
    let yAxisMin = 0;
    let yAxisMax = 100;
    if (minY !== Infinity && maxY !== -Infinity) {
      const diff = maxY - minY;
      // Recortamos dejando un colchón visual del 20% abajo y 10% arriba, maximizando las diferencias
      yAxisMin = Math.max(0, Math.floor(minY - diff * 0.2));
      yAxisMax = Math.min(100, Math.ceil(maxY + diff * 0.1));
      if (yAxisMin === yAxisMax) { // Prevención por si todos los datos son idénticos
        yAxisMin = Math.max(0, yAxisMin - 5);
        yAxisMax = Math.min(100, yAxisMax + 5);
      }
    }

    return {
      title: { show: false },
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
          if (xLabel === ' ') return ''; // Evita mostrar tooltip en el gap 6/7
          
          let html = `<div class="px-4 py-3 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">${isXAxisGrade ? 'Grado / Grupo:' : 'Periodo:'} ${xLabel}</div>`;
          html += `<div class="p-3 space-y-2">`;
          
          params.forEach(p => {
            if (p.data && p.data.value != null) {
              const meta = p.data.meta;
              html += `
                <div class="flex flex-col text-sm border-l-4 pl-2" style="border-color: ${p.color}">
                  <span class="font-bold text-slate-800">${p.seriesName} <span class="text-brand-600 ml-1">${p.data.value}%</span></span>
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
      yAxis: { type: 'value', min: yAxisMin, max: yAxisMax, splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }, axisLabel: { fontWeight: 600, color: '#64748b' } },
      series
    };
  });

  return { chartOptions, customColors };
}