import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// Vue-ECharts y carga global de ECharts
import ECharts from 'vue-echarts'
import 'echarts' 

const app = createApp(App)

// Registrar el componente globalmente
app.component('v-chart', ECharts)

app.mount('#app')