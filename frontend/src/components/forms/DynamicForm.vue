<script setup lang="ts">
import { computed } from 'vue';
import BaseInput from '../base/BaseInput.vue';
import BaseSelect from '../base/BaseSelect.vue';
import BaseTextarea from '../base/BaseTextarea.vue';
import BaseCheckbox from '../base/BaseCheckbox.vue';

export type DynamicFieldOption = { value: string; label: string };

export type DynamicField = {
  key: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'checkbox';
  label: string;
  required?: boolean;
  options?: DynamicFieldOption[];
  hint?: string;
};

export type DynamicFormValue = Record<string, string | boolean>;

const props = defineProps<{
  fields: DynamicField[];
  modelValue: DynamicFormValue;
}>();

const emit = defineEmits<{
  'update:modelValue': [DynamicFormValue];
}>();

const values = computed(() => props.modelValue);

function setString(key: string, value: string) {
  emit('update:modelValue', { ...values.value, [key]: value });
}

function setBool(key: string, value: boolean) {
  emit('update:modelValue', { ...values.value, [key]: value });
}

function asString(key: string): string {
  const v = values.value[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function asBool(key: string): boolean {
  return Boolean(values.value[key]);
}
</script>

<template>
  <div class="dyn">
    <template v-for="field in fields" :key="field.key">
      <BaseInput
        v-if="field.type === 'text' || field.type === 'number' || field.type === 'date'"
        :label="field.label"
        :model-value="asString(field.key)"
        :type="field.type === 'text' ? 'text' : field.type"
        :required="field.required"
        :hint="field.hint"
        :ltr="field.type === 'number' || field.type === 'date'"
        @update:model-value="setString(field.key, $event)"
      />

      <BaseTextarea
        v-else-if="field.type === 'textarea'"
        :label="field.label"
        :model-value="asString(field.key)"
        :required="field.required"
        :hint="field.hint"
        @update:model-value="setString(field.key, $event)"
      />

      <BaseSelect
        v-else-if="field.type === 'select'"
        :label="field.label"
        :model-value="asString(field.key)"
        :options="field.options ?? []"
        :required="field.required"
        :hint="field.hint"
        @update:model-value="setString(field.key, $event)"
      />

      <BaseCheckbox
        v-else-if="field.type === 'checkbox'"
        :label="field.label"
        :model-value="asBool(field.key)"
        :required="field.required"
        :hint="field.hint"
        @update:model-value="setBool(field.key, $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.dyn {
  display: grid;
  gap: var(--space-4);
}
</style>
