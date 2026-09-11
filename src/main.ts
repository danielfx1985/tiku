import { createApp } from 'vue'
import {
  Button,
  ConfigProvider,
  Empty,
  Field,
  NavBar,
  Popup,
  Progress,
  Switch,
  Tag,
} from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'
import { router } from './router'
import './styles.css'

const app = createApp(App)
app.use(router)
app.use(ConfigProvider)
app.use(Button)
app.use(Empty)
app.use(Field)
app.use(NavBar)
app.use(Popup)
app.use(Progress)
app.use(Switch)
app.use(Tag)
app.mount('#app')
