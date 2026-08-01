<script setup lang="ts">
import { RouterLink } from 'vue-router';

export type SidebarNavItem = {
  to: string;
  label: string;
  exact?: boolean;
};

export type SidebarNavGroup = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};

const props = defineProps<{
  id?: string;
  brandTitle: string;
  brandEyebrow?: string;
  groups: SidebarNavGroup[];
  openGroups: Record<string, boolean>;
}>();

const emit = defineEmits<{
  toggleGroup: [id: string];
  'update:openGroups': [Record<string, boolean>];
}>();

function onToggle(id: string) {
  emit('toggleGroup', id);
  emit('update:openGroups', {
    ...props.openGroups,
    [id]: !props.openGroups[id],
  });
}
</script>

<template>
  <aside :id="id" class="sidebar" aria-label="Primary">
    <div class="brand">
      <p v-if="brandEyebrow" class="eyebrow">{{ brandEyebrow }}</p>
      <p class="brand-title">{{ brandTitle }}</p>
    </div>

    <nav>
      <div v-for="group in groups" :key="group.id" class="group">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="Boolean(openGroups[group.id])"
          :aria-controls="`sidebar-group-${group.id}`"
          @click="onToggle(group.id)"
        >
          <span>{{ group.label }}</span>
          <span class="chev" aria-hidden="true">{{ openGroups[group.id] ? '▾' : '▸' }}</span>
        </button>
        <div
          v-show="openGroups[group.id]"
          :id="`sidebar-group-${group.id}`"
          class="group-items"
        >
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :active-class="item.exact ? '' : 'active'"
            exact-active-class="active"
          >
            {{ item.label }}
          </RouterLink>
        </div>
      </div>
    </nav>

    <div v-if="$slots.footer" class="footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-4);
  background: linear-gradient(180deg, var(--brand-deep), var(--color-primary));
  color: var(--color-on-primary);
  min-height: 100%;
}
.brand-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: #fff;
  line-height: 1.25;
}
.eyebrow {
  margin: 0 0 var(--space-1);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.68rem;
  opacity: 0.75;
}
.group {
  display: grid;
  gap: var(--space-1);
}
.group-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: var(--space-2) var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.group-toggle:focus-visible,
nav a:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.group-items {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
nav a {
  padding: 0.45rem 0.65rem;
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.92rem;
  text-decoration: none;
}
nav a.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.footer {
  margin-block-start: auto;
  display: grid;
  gap: var(--space-3);
}
</style>
