import { ref, computed, reactive, watch } from 'vue';
import { DATA_API_URL } from '../utils/constants';

export function useAcademicData() {
  const rawData = ref(null);
  const isLoading = ref(true);
  const error = ref(null);

  const selections = reactive({
    sheets: [],
    periods: [],
    subjects: [],
    grades: [],
    grouping: 'period', // 'period' or 'grade'
    chartType: 'bar',
    palette: 'soft'
  });

  const loadData = async () => {
    try {
      const response = await fetch(DATA_API_URL);
      rawData.value = await response.json();
      
      // Auto-select initial defaults
      if (availableSheets.value.length) selections.sheets = [availableSheets.value[0]];
    } catch (err) {
      error.value = "No se pudo cargar la información académica.";
    } finally {
      isLoading.value = false;
    }
  };

  const availableSheets = computed(() => rawData.value ? Object.keys(rawData.value.sheets) : []);
  
  const availablePeriods = computed(() => {
    if (!rawData.value) return [];
    const set = new Set();
    selections.sheets.forEach(s => {
      (rawData.value.sheets[s].periods || []).forEach(p => set.add(p.name));
    });
    return Array.from(set);
  });

  const availableSubjects = computed(() => {
    if (!rawData.value) return [];
    const set = new Set();
    selections.sheets.forEach(s => {
      (rawData.value.sheets[s].periods || [])
        .filter(p => selections.periods.includes(p.name))
        .forEach(p => p.subjects.forEach(sb => set.add(sb.name)));
    });
    return [{ value: '__avg__', label: 'Promedio General' }, ...Array.from(set).map(s => ({ value: s, label: s }))];
  });

  const availableGrades = computed(() => {
    if (!rawData.value) return [];
    const set = new Set();
    const activeSubjects = selections.subjects.filter(s => s !== '__avg__');
    
    selections.sheets.forEach(s => {
      (rawData.value.sheets[s].periods || [])
        .filter(p => selections.periods.includes(p.name))
        .forEach(p => {
          p.subjects
            .filter(sb => activeSubjects.length === 0 || activeSubjects.includes(sb.name))
            .forEach(sb => {
              Object.keys(sb.grades).forEach(k => {
                if (/^\d+$/.test(k)) set.add(k);
              });
            });
        });
    });
    
    const numericGrades = Array.from(set).sort((a, b) => Number(a) - Number(b)).map(g => ({ value: g, label: `Grado ${g}` }));
    return [
      { value: 'all', label: 'Todos los Grados' },
      { value: 'avg', label: 'Promedio de Grados' },
      ...numericGrades
    ];
  });

  // Cascade resets
  watch(() => selections.sheets, () => {
    selections.periods = selections.periods.filter(p => availablePeriods.value.includes(p));
    if(!selections.periods.length && availablePeriods.value.length) selections.periods = [availablePeriods.value[0]];
  });

  return { rawData, isLoading, error, selections, availableSheets, availablePeriods, availableSubjects, availableGrades, loadData };
}