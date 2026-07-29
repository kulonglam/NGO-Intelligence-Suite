import { defineStore } from 'pinia';
import { onMounted, onUnmounted, ref } from 'vue';

export const useConnectivityStore = defineStore('connectivity', () => {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const justReconnected = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function sync() {
    const next = navigator.onLine;
    if (next && !online.value) {
      justReconnected.value = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        justReconnected.value = false;
      }, 4000);
    }
    online.value = next;
  }

  function start() {
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
  }

  function stop() {
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
    if (timer) clearTimeout(timer);
  }

  return { online, justReconnected, start, stop };
});

/** Call once from App.vue to bind window online/offline listeners. */
export function useConnectivityLifecycle() {
  const store = useConnectivityStore();
  onMounted(() => store.start());
  onUnmounted(() => store.stop());
  return store;
}
