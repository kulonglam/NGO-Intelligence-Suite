<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';

export type PaletteItem = {
  id: string;
  to: string;
  labelKey: string;
  groupKey: string;
  anyOf?: string[];
  module?: string;
  featureFlag?: string;
};

const props = defineProps<{
  open: boolean;
  items: PaletteItem[];
}>();

const emit = defineEmits<{ close: []; 'update:open': [boolean] }>();

const { t } = useI18n();
const auth = useAuthStore();
const tenant = useTenantStore();
const router = useRouter();
const query = ref('');
const active = ref(0);
const panel = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const previouslyFocused = ref<HTMLElement | null>(null);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.items
    .filter(
      (item) =>
        auth.canAny(item.anyOf) &&
        tenant.moduleEnabled(item.module) &&
        tenant.featureEnabled(item.featureFlag),
    )
    .filter((item) => {
      if (!q) return true;
      const label = t(item.labelKey).toLowerCase();
      const group = t(item.groupKey).toLowerCase();
      return label.includes(q) || group.includes(q) || item.to.includes(q);
    });
});

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null;
      query.value = '';
      active.value = 0;
      await nextTick();
      input.value?.focus();
    } else if (previouslyFocused.value) {
      previouslyFocused.value.focus();
    }
  },
);

watch(filtered, () => {
  active.value = 0;
});

function close() {
  emit('update:open', false);
  emit('close');
}

function go(item: PaletteItem) {
  close();
  void router.push(item.to);
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    active.value = Math.min(filtered.value.length - 1, active.value + 1);
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = Math.max(0, active.value - 1);
  }
  if (e.key === 'Enter') {
    const item = filtered.value[active.value];
    if (item) {
      e.preventDefault();
      go(item);
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="close">
    <div
      ref="panel"
      class="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('search.title')"
    >
      <input
        ref="input"
        v-model="query"
        type="search"
        class="query"
        :placeholder="t('search.placeholder')"
        autocomplete="off"
      />
      <ul role="listbox">
        <li
          v-for="(item, i) in filtered"
          :key="item.id"
          role="option"
          :aria-selected="i === active"
          :class="{ active: i === active }"
          @mouseenter="active = i"
          @click="go(item)"
        >
          <span class="label">{{ t(item.labelKey) }}</span>
          <span class="group">{{ t(item.groupKey) }}</span>
        </li>
        <li v-if="!filtered.length" class="empty">{{ t('search.empty') }}</li>
      </ul>
      <p class="hint">{{ t('search.hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(20, 38, 43, 0.45);
  display: grid;
  place-items: start center;
  padding: 12vh 1rem 1rem;
}
.panel {
  width: min(36rem, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.query {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 1rem 1.1rem;
  font: inherit;
  font-size: 1.05rem;
  background: transparent;
  color: var(--color-text);
}
.query:focus {
  outline: none;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
  max-height: 18rem;
  overflow: auto;
}
li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
}
li.active {
  background: var(--color-primary-subtle);
}
.label {
  font-weight: 600;
  color: var(--brand-deep);
}
.group {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.empty {
  justify-content: center;
  color: var(--color-text-muted);
  cursor: default;
}
.hint {
  margin: 0;
  padding: 0.55rem 1rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
</style>
