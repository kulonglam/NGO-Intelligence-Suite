import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([]);

  function push(kind: ToastKind, message: string, ms = 4200) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    items.value = [...items.value, { id, kind, message }];
    window.setTimeout(() => dismiss(id), ms);
  }

  function success(message: string) {
    push('success', message);
  }

  function error(message: string) {
    push('error', message);
  }

  function info(message: string) {
    push('info', message);
  }

  function dismiss(id: string) {
    items.value = items.value.filter((t) => t.id !== id);
  }

  return { items, push, success, error, info, dismiss };
});
