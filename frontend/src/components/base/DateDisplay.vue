<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatGregorian, formatHijri } from '../../lib/format';
import { useLocaleStore } from '../../stores/locale';

const props = defineProps<{
  value: string | number | Date;
  /** Force Hijri companion; defaults to locale preference for Arabic. */
  showHijri?: boolean;
}>();

const { locale } = useI18n();
const localeStore = useLocaleStore();

const gregorian = computed(() => formatGregorian(props.value, locale.value));

const iso = computed(() => {
  const d =
    props.value instanceof Date ? props.value : new Date(props.value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
});

const withHijri = computed(() => {
  if (typeof props.showHijri === 'boolean') return props.showHijri;
  return localeStore.showHijri && locale.value === 'ar';
});

const hijri = computed(() =>
  withHijri.value ? formatHijri(props.value, locale.value) : null,
);
</script>

<template>
  <time class="date" :datetime="iso">
    <span class="gregorian bidi-isolate" dir="ltr">{{ gregorian }}</span>
    <span v-if="hijri" class="hijri">
      <span class="sep" aria-hidden="true"> · </span>
      <span class="hijri-label">{{ hijri }}</span>
    </span>
  </time>
</template>

<style scoped>
.date {
  font-variant-numeric: tabular-nums;
}
.hijri {
  color: var(--color-text-muted);
  font-size: 0.92em;
}
</style>
