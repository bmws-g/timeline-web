import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 오프라인 캐시는 없어도 앱은 동작합니다. */
    })
  })
}
