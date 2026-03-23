<script setup>
import { PALETTES } from '../utils/constants';
import { Settings2, BarChart3, LineChart } from 'lucide-vue-next';

const props = defineProps({
  selections: Object,
  sheets: Array,
  periods: Array,
  subjects: Array,
  grades: Array,
  customColors: Object,
  chartOptions: Object
});
</script>

<template>
  <aside class="w-full lg:w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
    <div class="p-5 border-b border-slate-100 flex items-center gap-2 text-slate-800 font-semibold">
      <Settings2 :size="18" class="text-brand-500" /> Parámetros
    </div>

    <div class="p-5 space-y-6">
      <!-- Standard Selects -->
      <div class="space-y-4">
        <div class="control-group">
          <label>Planteles (Sheets)</label>
          <select multiple v-model="selections.sheets" class="custom-select">
            <option v-for="s in sheets" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="control-group">
          <label>Periodos</label>
          <select multiple v-model="selections.periods" class="custom-select">
            <option v-for="p in periods" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>

        <div class="control-group">
          <label>Materias</label>
          <select multiple v-model="selections.subjects" class="custom-select h-32">
            <option v-for="s in subjects" :key="s.value" :value="s.value" :class="{'font-bold text-brand-700': s.value === '__avg__'}">
              {{ s.label }}
            </option>
          </select>
        </div>

        <div class="control-group">
          <label>Grados</label>
          <select multiple v-model="selections.grades" class="custom-select h-32">
            <option v-for="g in grades" :key="g.value" :value="g.value">{{ g.label }}</option>
          </select>
        </div>
      </div>

      <!-- Visualization Config -->
      <div class="pt-4 border-t border-slate-100 space-y-4">
        <div class="control-group">
          <label>Eje X (Agrupar por)</label>
          <select v-model="selections.grouping" class="custom-select single">
            <option value="period">Comparar Periodos</option>
            <option value="grade">Comparar Grados</option>
          </select>
        </div>

        <div class="control-group">
          <label>Tipo de Gráfica</label>
          <div class="flex bg-slate-100 p-1 rounded-lg">
            <button @click="selections.chartType = 'bar'" :class="['flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all', selections.chartType === 'bar' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700']">
              <BarChart3 :size="16" /> Barras
            </button>
            <button @click="selections.chartType = 'line'" :class="['flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all', selections.chartType === 'line' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700']">
              <LineChart :size="16" /> Líneas
            </button>
          </div>
        </div>

        <div class="control-group">
          <label>Paleta de Color</label>
          <select v-model="selections.palette" class="custom-select single">
            <option v-for="(pal, key) in PALETTES" :key="key" :value="key">{{ pal.name }}</option>
          </select>
        </div>
      </div>
      
      <!-- Color Overrides (Only show if series exist) -->
      <div v-if="chartOptions && chartOptions.series.length" class="pt-4 border-t border-slate-100">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Colores de Serie</label>
        <div class="space-y-2">
          <div v-for="series in chartOptions.series" :key="series.name" class="flex items-center gap-2">
            <input type="color" v-model="customColors[series.name]" class="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0">
            <span class="text-xs text-slate-600 truncate flex-1" :title="series.name">{{ series.name }}</span>
          </div>
        </div>
      </div>

    </div>
  </aside>
</template>

<style scoped>
.control-group label {
  @apply block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2;
}
.custom-select {
  @apply w-full bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all;
}
.custom-select:not(.single) {
  @apply p-2 min-h-[100px];
}
.custom-select.single {
  @apply py-2 px-3;
}
.custom-select option {
  @apply p-1.5 rounded-md mb-0.5 cursor-pointer;
}
.custom-select option:checked {
  @apply bg-brand-50 text-brand-700 font-medium;
}
</style>