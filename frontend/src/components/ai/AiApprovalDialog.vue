<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Modal from '../feedback/Modal.vue';
import BaseButton from '../base/BaseButton.vue';
import BaseCheckbox from '../base/BaseCheckbox.vue';

defineProps<{
  open: boolean;
  attest: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  'update:attest': [boolean];
  approve: [];
  cancel: [];
}>();

const { t } = useI18n();

function close() {
  emit('update:open', false);
  emit('cancel');
}
</script>

<template>
  <Modal :open="open" :title="t('ai.approve')" @update:open="emit('update:open', $event)">
    <BaseCheckbox
      :model-value="attest"
      :label="t('ai.attest')"
      @update:model-value="emit('update:attest', $event)"
    />
    <template #footer>
      <BaseButton variant="ghost" :disabled="busy" @click="close">{{ t('app.cancel') }}</BaseButton>
      <BaseButton :disabled="busy" @click="emit('approve')">{{ t('ai.approve') }}</BaseButton>
    </template>
  </Modal>
</template>
