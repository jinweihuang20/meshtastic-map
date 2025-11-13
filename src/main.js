import { createApp } from 'vue'
import './style.css'
import 'leaflet/dist/leaflet.css'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'

// 禁止縮放功能
const disableZoom = () => {
    // 禁止雙擊縮放（移動端）- 只在非滾動區域生效
    let lastTouchEnd = 0
    let touchStartY = 0
    let touchStartTime = 0

    document.addEventListener('touchstart', (event) => {
        touchStartY = event.touches[0].clientY
        touchStartTime = Date.now()
    }, { passive: true })

    document.addEventListener('touchend', (event) => {
        const now = Date.now()
        const touchEndY = event.changedTouches[0].clientY
        const touchDuration = now - touchStartTime
        const touchDistance = Math.abs(touchEndY - touchStartY)

        // 只有在快速雙擊且移動距離很小時才阻止（避免影響滾動）
        if (now - lastTouchEnd <= 300 && touchDuration < 200 && touchDistance < 10) {
            event.preventDefault()
        }
        lastTouchEnd = now
    }, { passive: false })

    // 禁止手勢縮放（雙指縮放）
    document.addEventListener('gesturestart', (e) => {
        e.preventDefault()
    })

    document.addEventListener('gesturechange', (e) => {
        e.preventDefault()
    })

    document.addEventListener('gestureend', (e) => {
        e.preventDefault()
    })

    // 禁止 Ctrl + 滾輪縮放
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault()
        }
    }, { passive: false })

    // 禁止 Ctrl + +/- 縮放
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.keyCode === 187 || e.keyCode === 189)) {
            e.preventDefault()
        }
        // 禁止 Ctrl + 0 重置縮放
        if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.keyCode === 48)) {
            e.preventDefault()
        }
    })


    // 設置 meta viewport（動態設置以確保生效）
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no')
    }
}

// 在 DOM 加載完成後執行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableZoom)
} else {
    disableZoom()
}

const app = createApp(App)

app.use(router)
app.use(ElementPlus)
app.mount('#app')
