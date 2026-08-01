<script setup lang="ts">
defineProps<{
  people: string[];
  dates: string[];
  /** people × dates boolean matrix */
  marks: boolean[][];
}>();
</script>

<template>
  <div class="sheet" role="table" :aria-label="'Attendance'">
    <div class="row head" role="row">
      <div class="cell name" role="columnheader">Name</div>
      <div v-for="d in dates" :key="d" class="cell" role="columnheader" dir="ltr">{{ d }}</div>
    </div>
    <div v-for="(person, pi) in people" :key="person" class="row" role="row">
      <div class="cell name" role="cell">{{ person }}</div>
      <div
        v-for="(d, di) in dates"
        :key="`${person}-${d}`"
        class="cell mark"
        role="cell"
        :aria-label="marks[pi]?.[di] ? 'Present' : 'Absent'"
      >
        {{ marks[pi]?.[di] ? '✓' : '—' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.row {
  display: grid;
  grid-template-columns: 10rem repeat(auto-fit, minmax(3.5rem, 1fr));
  border-bottom: 1px solid var(--color-border);
}
.row:last-child {
  border-bottom: 0;
}
.head {
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 700;
}
.cell {
  padding: 0.55rem 0.65rem;
  text-align: center;
}
.cell.name {
  text-align: start;
  font-weight: 600;
}
.mark {
  font-variant-numeric: tabular-nums;
}
</style>
