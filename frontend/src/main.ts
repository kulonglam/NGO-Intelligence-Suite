import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { installRouteFocus } from './lib/focus';
import { useLocaleStore } from './stores/locale';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(i18n);
app.use(router);
installRouteFocus(router);

const localeStore = useLocaleStore(pinia);
void localeStore.init().then(() => {
  app.mount('#app');
});
