<script setup lang="ts">
</script>

<template>
  <div class="actions">
    <slot />
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
}
</style>
