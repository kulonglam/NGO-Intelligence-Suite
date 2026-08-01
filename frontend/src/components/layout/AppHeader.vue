<script setup lang="ts">
</script>

<template>
  <header class="header">
    <div v-if="$slots.start" class="start">
      <slot name="start" />
    </div>
    <div class="main">
      <slot name="main" />
    </div>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  min-height: var(--header-height);
  padding: var(--space-2) var(--space-5);
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.start {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>
