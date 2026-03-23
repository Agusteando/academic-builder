import { createApp } from 'vue'
import App from './App.vue'
import './style.css' // Ensure this exists and contains Tailwind directives

// ECharts setup
import ECharts from 'vue-echarts'
import * as echarts from 'echarts'

const app = createApp(App)
app.component('v-chart', ECharts)
app.provide('echarts', echarts)
app.mount('#app')