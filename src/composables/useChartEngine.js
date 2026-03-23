import { computed, ref, watch } from 'vue';
import { PALETTES } from '../utils/constants';

export function useChartEngine(rawData, selections) {
  const customColors = ref({});

  // Reset colors when changing palettes
  watch(() => selections.palette, () => { customColors.value = {}; });

  /* --- Deep Extraction Engine --- */
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

    /* 1. Resolve X-Axis Categories and Determine Educational Blocks */
    let rawCategories = [];
    if (isXAxisGrade) {
      const allPossibleGrades = new Set();
      gradesRaw.forEach(g => {
        if (g === 'all') {
          sheets.forEach(sh => (rawData.value.sheets[sh].periods || []).forEach(per => per.subjects.forEach(subj => Object.keys(subj.grades).forEach(k => { if (/^\d+$/.test(k)) allPossibleGrades.add(k); }))));
        } else {
          allPossibleGrades.add(g);
        }
      });
      rawCategories = Array.from(allPossibleGrades);
    } else {
      rawCategories = periods;
    }

    const xAxisKeys = [];
    const xAxisLabels = [];
    
    // Construct the explicit blocks
    if (isXAxisGrade) {
      const primary = rawCategories.filter(g => /^\d+$/.test(g) && Number(g) >= 1 && Number(g) <= 6).sort((a,b) => Number(a)-Number(b));
      const secondary = rawCategories.filter(g => /^\d+$/.test(g) && Number(g) >= 7).sort((a,b) => Number(a)-Number(b));
      const others = rawCategories.filter(g => !/^\d+$/.test(g)); // avg or custom

      if (primary.length) {
        primary.forEach(g => { xAxisKeys.push(g); xAxisLabels.push(`Grado ${g}`); });
      }
      
      // Intentional Structural Gap between Block 1 and Block 2
      if (primary.length && (secondary.length || others.length)) {
        xAxisKeys.push('__block_gap__'); 
        xAxisLabels.push(''); 
      }
      
      if (secondary.length) {
        secondary.forEach(g => { xAxisKeys.push(g); xAxisLabels.push(`Grado ${g}`); });
      }

      // Secondary Gap for custom metrics like 'Promedios'
      if (others.length) {
        if (xAxisKeys.length && !xAxisKeys[xAxisKeys.length-1].startsWith('__block_gap')) {
            xAxisKeys.push('__block_gap_2__'); 
            xAxisLabels.push(''); 
        }
        others.forEach(g => { xAxisKeys.push(g); xAxisLabels.push('Promedio'); });
      }
    } else {
      rawCategories.forEach(p => { xAxisKeys.push(p); xAxisLabels.push(p); });
    }

    if (xAxisKeys.length === 0) return null;

    /* 2. Intentional Comparison Pivoting (Subject -> Period -> Plantel) */
    const allCombinations = [];
    if (isXAxisGrade) {
       subsRaw.forEach(sb => periods.forEach(p => sheets.forEach(sh => allCombinations.push({ plantel: sh, period: p, subject: sb }))));
    } else {
       subsRaw.forEach(sb => {
         const nonAllGrades = gradesRaw.includes('all') ? ['avg'] : gradesRaw; // simplified default for period-view
         nonAllGrades.forEach(g => sheets.forEach(sh => allCombinations.push({ plantel: sh, grade: g, subject: sb })));
       });
    }

    // Force strict sorting so ECharts groups elements side-by-side explicitly
    allCombinations.sort((a, b) => {
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      if (isXAxisGrade && a.period !== b.period) return a.period.localeCompare(b.period);
      if (!isXAxisGrade && a.grade !== b.grade) return a.grade.localeCompare(b.grade);
      return a.plantel.localeCompare(b.plantel);
    });

    /* 3. Generate Valid Series and Assign Colors */
    const seriesConfigs = [];
    let minY = Infinity;
    let maxY = -Infinity;

    allCombinations.forEach(combo => {
      const { plantel, period, subject, grade } = combo;
      const dataArr = [];
      let hasData = false;

      xAxisKeys.forEach(xKey => {
         if (xKey.startsWith('__block_gap')) {
           dataArr.push(null); // Structural gap
           return;
         }
         
         const g = isXAxisGrade ? xKey : grade;
         const p = isXAxisGrade ? period : xKey;
         const val = fetchValue(plantel, p, subject, g, rawData.value);
         
         if (val !== null) {
           hasData = true;
           minY = Math.min(minY, val);
           maxY = Math.max(maxY, val);
           dataArr.push({
             value: Number(val.toFixed(2)),
             meta: { plantel, periodo: p, materia: subject === '__avg__' ? 'Promedio Gral' : subject, grado: g }
           });
         } else {
           dataArr.push(null);
         }
      });

      if (hasData) {
        // Master Color mapped to the Plantel (Family Group)
        if (!customColors.value[plantel]) {
           const colorIdx = Object.keys(customColors.value).length;
           customColors.value[plantel] = currentPalette[colorIdx % currentPalette.length].base;
        }
        
        combo.baseColor = customColors.value[plantel];
        combo.data = dataArr;
        
        // Logical series naming for Tooltip & Legend
        const nameParts = [plantel];
        if (!isXAxisGrade) nameParts.push(`G.${grade}`);
        if (isXAxisGrade && periods.length > 1) nameParts.push(period);
        if (subsRaw.length > 1) nameParts.push(subject === '__avg__' ? 'Promedio Gral' : subject);
        
        combo.seriesName = nameParts.join(' - ');
        seriesConfigs.push(combo);
      }
    });

    if (seriesConfigs.length === 0) return null;

    /* 4. Shade Assignment Engine (Variations based on Master Family) */
    const plantelGroups = {};
    seriesConfigs.forEach(cfg => {
      if (!plantelGroups[cfg.plantel]) plantelGroups[cfg.plantel] = [];
      plantelGroups[cfg.plantel].push(cfg);
    });

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

    Object.keys(plantelGroups).forEach(plantel => {
      const configs = plantelGroups[plantel];
      const maxPoints = configs.length;
      configs.forEach((cfg, idx) => {
        // Distribute shades dynamically from lighter to darker across sub-entities
        const factor = maxPoints === 1 ? 0 : 0.4 - (idx * (0.8 / (maxPoints - 1)));
        cfg.itemColor = generateShade(cfg.baseColor, factor);
      });
    });

    const series = seriesConfigs.map(cfg => ({
      name: cfg.seriesName,
      type: chartType,
      smooth: true,
      barGap: barGap || '5%',
      barCategoryGap: categoryGap || '20%', 
      itemStyle: {
        borderRadius: chartType === 'bar' ? [4, 4, 0, 0] : 0,
        color: cfg.itemColor
      },
      lineStyle: { width: 3, color: cfg.itemColor },
      label: {
        show: chartType === 'bar',
        position: 'top',
        distance: 5,
        color: '#1e293b',
        fontSize: 11,
        fontWeight: 700,
        formatter: p => p.data && p.data.value != null ? p.data.value : ''
      },
      data: cfg.data
    }));

    /* 5. Smart Y-Axis Cropping based strictly on visible data boundaries */
    let yAxisMin = 0;
    let yAxisMax = 100;
    if (minY !== Infinity && maxY !== -Infinity) {
      const diff = maxY - minY;
      yAxisMin = Math.max(0, Math.floor(minY - diff * 0.15));
      yAxisMax = Math.min(100, Math.ceil(maxY + diff * 0.15));
      if (yAxisMin === yAxisMax) { yAxisMin = Math.max(0, yAxisMin - 5); yAxisMax = Math.min(100, yAxisMax + 5); }
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
          if (!xLabel || xLabel === '') return ''; // Ignore rendering on structural block gaps
          
          let html = `<div class="px-4 py-3 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">${isXAxisGrade ? 'Sección: ' : 'Periodo: '} ${xLabel}</div>`;
          html += `<div class="p-3 space-y-2">`;
          
          // Sort tooltip descending
          const sortedParams = [...params].sort((a, b) => (b.data?.value || 0) - (a.data?.value || 0));
          
          sortedParams.forEach(p => {
            if (p.data && p.data.value != null) {
              const meta = p.data.meta;
              html += `
                <div class="flex flex-col text-sm border-l-4 pl-2" style="border-color: ${p.color}">
                  <span class="font-bold text-slate-800">${p.seriesName.split(' - ')[0]} <span class="text-brand-600 ml-1">${p.data.value}%</span></span>
                  <span class="text-xs text-slate-500">${meta.materia} ${isXAxisGrade && periods.length > 1 ? `(${meta.periodo})` : ''}</span>
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
      xAxis: { 
        type: 'category', 
        data: xAxisLabels, 
        axisLabel: { color: '#334155', fontWeight: 700, fontSize: 13, interval: 0 },
        axisTick: { alignWithLabel: true },
        splitLine: { show: true, lineStyle: { type: 'dashed', color: '#cbd5e1' } } // Draws the physical boundary on gaps
      },
      yAxis: { type: 'value', min: yAxisMin, max: yAxisMax, splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }, axisLabel: { fontWeight: 600, color: '#64748b' } },
      series
    };
  });

  return { chartOptions, customColors };
}