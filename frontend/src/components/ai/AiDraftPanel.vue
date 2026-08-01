<script setup lang="ts">
import BaseTextarea from '../base/BaseTextarea.vue';
import MachineGeneratedLabel from './MachineGeneratedLabel.vue';

defineProps<{
  modelValue: string;
  label: string;
  rows?: number;
}>();

const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<template>
  <div class="draft">
    <MachineGeneratedLabel />
    <div v-if="$slots.citations" class="citations">
      <slot name="citations" />
    </div>
    <BaseTextarea
      :model-value="modelValue"
      :label="label"
      :rows="rows ?? 8"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.draft {
  display: grid;
  gap: var(--space-3);
}
.citations {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
