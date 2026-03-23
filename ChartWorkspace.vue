<script setup>
import { computed } from 'vue';
import { Download, Table, BarChart3 } from 'lucide-vue-next'; // <-- Aquí está el icono corregido

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

<template>
  <section class="flex-1 bg-slate-50 p-6 flex flex-col min-w-0 overflow-y-auto">
    
    <div class="max-w-6xl mx-auto w-full flex-1 flex flex-col h-full gap-4">
      
      <!-- Top Workspace Bar -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-800 tracking-tight">{{ generatedTitle }}</h2>
          <p class="text-sm text-slate-500 mt-1">
            {{ options ? 'Haz hover en la gráfica para ver detalles. Usa la barra superior de la gráfica para zoom/imágenes.' : 'Selecciona planteles, periodos, materias y grados en el panel lateral.' }}
          </p>
        </div>

        <button v-if="options" @click="exportCSV" class="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm">
          <Table :size="16" />
          Descargar CSV
        </button>
      </div>

      <!-- Chart Container -->
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 min-h-[500px] relative p-4 flex flex-col">
        
        <!-- Estado Vacío -->
        <div v-if="!options" class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3 z-10">
          <BarChart3 :size="48" stroke-width="1" />
          <p class="text-sm font-medium">No hay suficientes datos seleccionados.</p>
        </div>

        <!-- Gráfica ECharts -->
        <v-chart v-else class="echarts-container w-full h-full flex-1" :option="options" autoresize />
      </div>

    </div>
  </section>
</template>

<style scoped>
/* Nos aseguramos de que vue-echarts tome todo el contenedor */
.echarts-container {
  width: 100% !important;
  height: 100% !important;
  min-height: 450px;
}
</style>