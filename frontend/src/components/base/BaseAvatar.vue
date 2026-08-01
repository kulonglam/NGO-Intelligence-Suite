<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: string;
  size?: 'sm' | 'md' | 'lg';
}>();

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return '?';
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
});
</script>

<template>
  <span class="avatar" :class="size ?? 'md'" :aria-label="name" role="img">
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-weight: 700;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
}
.sm {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.7rem;
}
.md {
  width: 2.25rem;
  height: 2.25rem;
  font-size: 0.8rem;
}
.lg {
  width: 3rem;
  height: 3rem;
  font-size: 1rem;
}
</style>
