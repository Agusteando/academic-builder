<script setup>
import { onMounted } from 'vue';
import { useAcademicData } from './composables/useAcademicData';
import { useChartEngine } from './composables/useChartEngine';
import SidebarControls from './components/SidebarControls.vue';
import ChartWorkspace from './components/ChartWorkspace.vue';
import { Activity, AlertCircle } from 'lucide-vue-next';

const { rawData, isLoading, error, selections, availableSheets, availablePeriods, availableSubjects, availableGrades, loadData } = useAcademicData();
const { chartOptions, customColors } = useChartEngine(rawData, selections);

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
      <div class="flex items-center gap-3">
        <div class="bg-brand-600 p-2 rounded-lg text-white">
          <Activity :size="20" stroke-width="2.5" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-900 leading-tight">Analytical Workbench</h1>
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wider">Reporte Académico</p>
        </div>
      </div>
    </header>

    <!-- Main Layout -->
    <main class="flex-1 flex flex-col lg:flex-row overflow-hidden max-h-[calc(100vh-73px)]">
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex-1 flex flex-col items-center justify-center text-slate-400">
        <Activity class="animate-pulse mb-4" :size="48" />
        <p class="text-lg font-medium">Procesando conjunto de datos...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center text-red-500">
        <AlertCircle class="mb-4" :size="48" />
        <p class="text-lg font-medium">{{ error }}</p>
      </div>

      <!-- Application Core -->
      <template v-else>
        <!-- Left Sidebar Controls -->
        <SidebarControls 
          :selections="selections"
          :sheets="availableSheets"
          :periods="availablePeriods"
          :subjects="availableSubjects"
          :grades="availableGrades"
          :customColors="customColors"
          :chartOptions="chartOptions"
        />

        <!-- Right Workspace -->
        <ChartWorkspace :options="chartOptions" :selections="selections" />
      </template>

    </main>
  </div>
</template>