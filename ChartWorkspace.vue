<script setup>
import { computed } from 'vue';
import { Download, Table, BarChart3 } from 'lucide-vue-next';

const props = defineProps({
  options: Object,
  selections: Object
});

const generatedTitle = computed(() => {
  if (!props.options) return "Configura los parámetros para visualizar datos";
  const { sheets, subjects, grouping } = props.selections;
  const subjStr = subjects.includes('__avg__') ? 'Promedios Generales' : (subjects.length === 1 ? 'Materia Específica' : 'Comparativa de Materias');
  const context = grouping === 'period' ? 'a través de Periodos' : 'por Grado Escolar';
  return `Análisis de ${subjStr} ${context}`;
});

const exportCSV = () => {
  if (!props.options) return;
  const labels = props.options.xAxis.data;
  const rows = [ ['Serie', ...labels].join(',') ];
  
  props.options.series.forEach(s => {
    rows.push([ `"${s.name}"`, ...s.data.map(d => d ?? '') ].join(','));
  });
  
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reporte_academico.csv';
  a.click();
  URL.revokeObjectURL(url);
};
</script>