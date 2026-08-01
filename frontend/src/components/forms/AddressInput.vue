<script setup lang="ts">
import { computed } from 'vue';
import BaseInput from '../base/BaseInput.vue';

export type AddressValue = {
  line1: string;
  line2?: string;
  city: string;
  country: string;
};

const props = defineProps<{
  modelValue: AddressValue;
  line1Label?: string;
  line2Label?: string;
  cityLabel?: string;
  countryLabel?: string;
  required?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [AddressValue];
}>();

const value = computed(() => props.modelValue);

function patch(partial: Partial<AddressValue>) {
  emit('update:modelValue', { ...value.value, ...partial });
}
</script>

<template>
  <fieldset class="address">
    <BaseInput
      :label="line1Label ?? 'Address line 1'"
      :model-value="value.line1"
      :required="required"
      autocomplete="address-line1"
      ltr
      @update:model-value="patch({ line1: $event })"
    />
    <BaseInput
      :label="line2Label ?? 'Address line 2'"
      :model-value="value.line2 ?? ''"
      autocomplete="address-line2"
      ltr
      @update:model-value="patch({ line2: $event })"
    />
    <div class="row">
      <BaseInput
        :label="cityLabel ?? 'City'"
        :model-value="value.city"
        :required="required"
        autocomplete="address-level2"
        ltr
        @update:model-value="patch({ city: $event })"
      />
      <BaseInput
        :label="countryLabel ?? 'Country'"
        :model-value="value.country"
        :required="required"
        autocomplete="country-name"
        ltr
        @update:model-value="patch({ country: $event })"
      />
    </div>
  </fieldset>
</template>

<style scoped>
.address {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
@media (max-width: 560px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
