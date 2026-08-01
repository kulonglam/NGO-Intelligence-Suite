<script setup lang="ts">
import { ref, useId } from 'vue';

defineProps<{
  content: string;
}>();

const id = useId();
const open = ref(false);

function show() {
  open.value = true;
}
function hide() {
  open.value = false;
}
</script>

<template>
  <span
    class="wrap"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <span class="trigger" :aria-describedby="open ? id : undefined">
      <slot />
    </span>
    <span v-show="open" :id="id" role="tooltip" class="tooltip">{{ content }}</span>
  </span>
</template>

<style scoped>
.wrap {
  position: relative;
  display: inline-flex;
}
.trigger {
  display: inline-flex;
}
.tooltip {
  position: absolute;
  bottom: calc(100% + 0.4rem);
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: 20;
  max-width: 16rem;
  padding: 0.35rem 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-text-inverse);
  font-size: 0.8rem;
  line-height: 1.35;
  white-space: normal;
  pointer-events: none;
  box-shadow: var(--shadow-sm);
}
:global([dir='rtl']) .tooltip {
  transform: translateX(50%);
}
</style>
