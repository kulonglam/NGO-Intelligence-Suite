<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();
</script>

<template>
  <button
    class="btn"
    :class="variant ?? 'primary'"
    :type="type ?? 'button'"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border-radius: var(--radius-pill);
  padding: 0.65rem 1rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.btn:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.primary {
  background: var(--brand);
  color: var(--on-brand);
}
.secondary {
  background: var(--accent);
  color: #fff;
}
.ghost {
  background: var(--surface);
  border-color: var(--line);
  color: var(--ink);
}
.danger {
  background: var(--danger);
  color: #fff;
}
</style>
