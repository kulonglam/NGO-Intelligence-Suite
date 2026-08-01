<script setup lang="ts">
import SkeletonBlock from '../feedback/SkeletonBlock.vue';

withDefaults(
  defineProps<{
    rows?: number;
    height?: string;
  }>(),
  { rows: 3, height: '1rem' },
);
</script>

<template>
  <SkeletonBlock :rows="rows" :height="height" />
</template>
