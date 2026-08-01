<script setup lang="ts">
defineProps<{
  name: 'search' | 'close' | 'chevron' | 'check' | 'alert' | 'info' | 'menu' | 'sun' | 'moon';
  /** When true, mirrors the icon in RTL (for directional glyphs). */
  directional?: boolean;
}>();
</script>

<template>
  <svg
    class="icon"
    :class="{ directional }"
    viewBox="0 0 24 24"
    width="1.25em"
    height="1.25em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6L6 18" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="M9 6l6 6-6 6" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="M5 12l5 5L19 7" />
    </template>
    <template v-else-if="name === 'alert'">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4M12 18h.01" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </template>
    <template v-else-if="name === 'menu'">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
    </template>
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: -0.15em;
  flex-shrink: 0;
}
.icon.directional {
  transform: scaleX(1);
}
:global([dir='rtl']) .icon.directional {
  transform: scaleX(-1);
}
</style>
