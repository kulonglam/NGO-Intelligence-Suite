<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'info' | 'success' | 'warning' | 'danger';
    title?: string;
    dismissible?: boolean;
  }>(),
  { variant: 'info', dismissible: false },
);

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div class="banner" :class="variant" role="status">
    <div class="body">
      <p v-if="title" class="title">{{ title }}</p>
      <div v-if="$slots.default" class="slot">
        <slot />
      </div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="dismiss"
      aria-label="Dismiss"
      @click="emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}
.body {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 500;
}
.slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.info {
  background: var(--color-info-subtle);
  border-bottom-color: color-mix(in srgb, var(--color-info) 40%, var(--color-border));
}
.success {
  background: var(--color-success-subtle);
  border-bottom-color: color-mix(in srgb, var(--color-success) 40%, var(--color-border));
}
.warning {
  background: var(--color-warning-subtle);
  border-bottom-color: color-mix(in srgb, var(--color-warning) 40%, var(--color-border));
}
.danger {
  background: var(--color-danger-subtle);
  border-bottom-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border));
}
.dismiss {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
  padding: 0.15rem;
}
.dismiss:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
</style>
