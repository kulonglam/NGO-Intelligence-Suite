<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import TabGroup from '../components/layout/TabGroup.vue';
import Accordion from '../components/layout/Accordion.vue';
import SplitPane from '../components/layout/SplitPane.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import BaseSelect from '../components/base/BaseSelect.vue';
import BaseTextarea from '../components/base/BaseTextarea.vue';
import BaseCheckbox from '../components/base/BaseCheckbox.vue';
import BaseRadio from '../components/base/BaseRadio.vue';
import BaseSwitch from '../components/base/BaseSwitch.vue';
import BaseDatePicker from '../components/base/BaseDatePicker.vue';
import BaseFileInput from '../components/base/BaseFileInput.vue';
import BaseBadge from '../components/base/BaseBadge.vue';
import BaseAvatar from '../components/base/BaseAvatar.vue';
import BaseIcon from '../components/base/BaseIcon.vue';
import BaseSpinner from '../components/base/BaseSpinner.vue';
import BaseTooltip from '../components/base/BaseTooltip.vue';
import BaseProgress from '../components/base/BaseProgress.vue';
import FormField from '../components/forms/FormField.vue';
import FormSection from '../components/forms/FormSection.vue';
import FormActions from '../components/forms/FormActions.vue';
import CurrencyInput from '../components/forms/CurrencyInput.vue';
import PercentInput from '../components/forms/PercentInput.vue';
import PhoneInput from '../components/forms/PhoneInput.vue';
import AddressInput from '../components/forms/AddressInput.vue';
import DynamicForm from '../components/forms/DynamicForm.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import Pagination from '../components/data/Pagination.vue';
import Timeline from '../components/data/Timeline.vue';
import KeyValueList from '../components/data/KeyValueList.vue';
import StatCard from '../components/data/StatCard.vue';
import SkeletonLoader from '../components/data/SkeletonLoader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import Modal from '../components/feedback/Modal.vue';
import Drawer from '../components/feedback/Drawer.vue';
import SyncStatusPanel from '../components/feedback/SyncStatusPanel.vue';
import ChartPanel from '../components/data/ChartPanel.vue';
import BurnRateChart from '../components/domain/BurnRateChart.vue';
import ComplianceScoreGauge from '../components/domain/ComplianceScoreGauge.vue';
import GrantStatusBadge from '../components/domain/GrantStatusBadge.vue';
import PayrollRunSummary from '../components/domain/PayrollRunSummary.vue';
import PayslipView from '../components/domain/PayslipView.vue';
import BeneficiaryCard from '../components/domain/BeneficiaryCard.vue';
import AttendanceSheet from '../components/domain/AttendanceSheet.vue';
import CertificateView from '../components/domain/CertificateView.vue';
import AuditTrailList from '../components/domain/AuditTrailList.vue';
import MachineGeneratedLabel from '../components/ai/MachineGeneratedLabel.vue';
import CitationChip from '../components/ai/CitationChip.vue';
import AiDraftPanel from '../components/ai/AiDraftPanel.vue';
import AiApprovalDialog from '../components/ai/AiApprovalDialog.vue';

const { t } = useI18n();
const tab = ref('primitives');
const text = ref('Sample');
const select = ref('a');
const check = ref(true);
const radio = ref('one');
const sw = ref(false);
const date = ref('2026-08-01');
const fileName = ref('');
const amount = ref('12500.00');
const currency = ref('USD');
const pct = ref('12.5');
const phone = ref('+211');
const address = ref({ line1: 'Juba', line2: '', city: 'Juba', country: 'SS' });
const dyn = ref<Record<string, string | boolean>>({ note: '', agree: false });
const filter = ref('');
const page = ref(1);
const pageSize = ref(10);
const selected = ref<string[]>([]);
const modalOpen = ref(false);
const drawerOpen = ref(false);
const progress = ref(62);

const tabs = [
  { id: 'primitives', label: 'Primitives' },
  { id: 'forms', label: 'Forms' },
  { id: 'data', label: 'Data' },
  { id: 'charts', label: 'Charts' },
  { id: 'domain', label: 'Domain' },
  { id: 'ai', label: 'AI' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'layout', label: 'Layout' },
];

const tableRows = [
  { id: '1', name: 'Alpha', status: 'active' },
  { id: '2', name: 'Beta', status: 'draft' },
  { id: '3', name: 'Gamma', status: 'approved' },
];

const virtualRows = Array.from({ length: 80 }, (_, i) => ({
  id: String(i + 1),
  name: `Row ${i + 1}`,
  status: i % 3 === 0 ? 'active' : 'draft',
}));

const draftText = ref('Sample AI draft for gallery.');
const attest = ref(false);
const aiDialog = ref(false);
</script>

<template>
  <section>
    <PageHeader
      :eyebrow="t('designSystem.eyebrow')"
      :title="t('designSystem.title')"
      :lede="t('designSystem.lede')"
    />

    <SectionCard :title="t('designSystem.tokens')" title-id="ds-tokens" class="block">
      <div class="swatches">
        <div class="swatch primary"><span>primary</span></div>
        <div class="swatch success"><span>success</span></div>
        <div class="swatch warning"><span>warning</span></div>
        <div class="swatch danger"><span>danger</span></div>
        <div class="swatch surface"><span>surface</span></div>
      </div>
    </SectionCard>

    <TabGroup v-model="tab" :tabs="tabs" class="block" />

    <div v-show="tab === 'primitives'" class="stack">
      <div class="row">
        <BaseButton>Primary</BaseButton>
        <BaseButton variant="secondary">Secondary</BaseButton>
        <BaseButton variant="ghost">Ghost</BaseButton>
        <BaseButton variant="danger">Danger</BaseButton>
        <BaseSpinner />
        <BaseTooltip content="Tooltip content">
          <BaseButton variant="ghost">Hover tip</BaseButton>
        </BaseTooltip>
      </div>
      <div class="row">
        <BaseBadge>Default</BaseBadge>
        <BaseBadge tone="success">Success</BaseBadge>
        <BaseBadge tone="warning">Warning</BaseBadge>
        <BaseBadge tone="danger">Danger</BaseBadge>
        <BaseAvatar name="Design Partner" />
        <BaseIcon name="search" />
        <BaseIcon name="check" />
        <BaseProgress :value="progress" label="Progress" />
      </div>
      <BaseInput v-model="text" label="BaseInput" />
      <BaseSelect
        v-model="select"
        label="BaseSelect"
        :options="[
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ]"
      />
      <BaseTextarea v-model="text" label="BaseTextarea" :rows="2" />
      <BaseCheckbox v-model="check" label="BaseCheckbox" />
      <BaseRadio v-model="radio" name="ds-radio" value="one" label="Radio one" />
      <BaseRadio v-model="radio" name="ds-radio" value="two" label="Radio two" />
      <BaseSwitch v-model="sw" label="BaseSwitch" />
      <BaseDatePicker v-model="date" label="BaseDatePicker" />
      <BaseFileInput v-model="fileName" label="BaseFileInput" />
    </div>

    <div v-show="tab === 'forms'" class="stack">
      <FormSection title="Form section" title-id="fs" lede="Composite inputs">
        <FormField label="Wrapped control" required hint="Hint text">
          <template #default="{ id }">
            <input :id="id" v-model="text" class="raw" />
          </template>
        </FormField>
        <CurrencyInput v-model="amount" v-model:currency="currency" label="Amount" />
        <PercentInput v-model="pct" label="Percent" />
        <PhoneInput v-model="phone" label="Phone" />
        <AddressInput v-model="address" />
        <DynamicForm
          v-model="dyn"
          :fields="[
            { key: 'note', type: 'text', label: 'Note' },
            { key: 'agree', type: 'checkbox', label: 'Agree' },
          ]"
        />
        <FormActions>
          <BaseButton variant="ghost">Cancel</BaseButton>
          <BaseButton>Save</BaseButton>
        </FormActions>
      </FormSection>
    </div>

    <div v-show="tab === 'data'" class="stack">
      <div class="stats">
        <StatCard label="Awards" value="12" />
        <StatCard label="Spend" value="USD 1.2M" />
      </div>
      <DataTableToolbar v-model="filter" />
      <DataTable
        v-model:selected="selected"
        :columns="[
          { key: 'name', label: 'Name', sortable: true },
          { key: 'status', label: 'Status' },
        ]"
        :rows="tableRows"
        caption="Demo"
        :filter-query="filter"
        selectable
        row-key="id"
      />
      <Pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :page-count="3"
      />
      <SkeletonLoader :rows="3" />
      <KeyValueList
        :items="[
          { key: 'a', label: 'Ceiling', value: 'USD 100,000' },
          { key: 'b', label: 'Status', value: 'Active' },
        ]"
      />
      <Timeline
        :items="[
          { id: '1', title: 'Created', at: '2026-01-01', body: 'Award opened' },
          { id: '2', title: 'Disbursed', at: '2026-03-01' },
        ]"
      />
      <p class="hint">Virtualised table (80 rows, auto ≥ 50)</p>
      <DataTable
        :columns="[
          { key: 'name', label: 'Name', sortable: true },
          { key: 'status', label: 'Status' },
        ]"
        :rows="virtualRows"
        caption="Virtual demo"
        :paginate="false"
        virtualize
        row-key="id"
      />
    </div>

    <div v-show="tab === 'charts'" class="stack">
      <ChartPanel
        title="KPI bars"
        type="bar"
        :categories="['Awards', 'Spend', 'Staff']"
        :series="[{ label: 'Count', values: [12, 8, 24] }]"
      />
      <ChartPanel
        title="Trend"
        type="line"
        :categories="['Jan', 'Feb', 'Mar', 'Apr']"
        :series="[
          { label: 'Disbursed', values: [10, 18, 14, 22] },
          { label: 'Expenses', values: [8, 12, 16, 15] },
        ]"
      />
      <BurnRateChart
        :categories="['SSD-001', 'SSD-002']"
        :budget="[100, 80]"
        :spent="[40, 55]"
      />
    </div>

    <div v-show="tab === 'domain'" class="stack">
      <div class="row">
        <GrantStatusBadge status="active" />
        <GrantStatusBadge status="pending_approval" />
        <ComplianceScoreGauge :score="78" label="Compliance" />
      </div>
      <PayrollRunSummary period="2026-08" status="approved" gross="SSP 1.2M" net="SSP 980k" />
      <PayslipView
        employee-name="Ada Lovelace"
        period="2026-08"
        currency="SSP"
        net="45000"
        :lines="[
          { label: 'Gross', amount: '50000' },
          { label: 'Tax', amount: '-5000' },
        ]"
      />
      <BeneficiaryCard name="Nyandeng Deng" settlement="Juba" :household-size="5" vulnerability="high" />
      <AttendanceSheet
        :people="['Asha', 'John']"
        :dates="['Mon', 'Tue', 'Wed']"
        :marks="[
          [true, true, false],
          [true, false, true],
        ]"
      />
      <CertificateView title="Safeguarding 101" code="LMS-SG-01" issued-at="2026-07-01" holder-name="Demo User" />
      <AuditTrailList
        title="Audit"
        :items="[
          { id: '1', title: 'Submitted', at: '2026-01-02', body: 'Maker' },
          { id: '2', title: 'Approved', at: '2026-01-03', body: 'Checker' },
        ]"
      />
    </div>

    <div v-show="tab === 'ai'" class="stack">
      <MachineGeneratedLabel />
      <div class="row">
        <CitationChip id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />
        <CitationChip id="11111111-2222-3333-4444-555555555555" label="cite-1" />
      </div>
      <AiDraftPanel v-model="draftText" label="Draft">
        <template #citations>
          <CitationChip id="demo-insight" />
        </template>
      </AiDraftPanel>
      <BaseButton @click="aiDialog = true">Open approval dialog</BaseButton>
      <AiApprovalDialog v-model:open="aiDialog" v-model:attest="attest" />
    </div>

    <div v-show="tab === 'feedback'" class="stack">
      <AlertBanner variant="info" title="Info">Body copy</AlertBanner>
      <AlertBanner variant="success" title="Success">Body copy</AlertBanner>
      <AlertBanner variant="warning" title="Warning">Body copy</AlertBanner>
      <AlertBanner variant="danger" title="Danger">Body copy</AlertBanner>
      <SyncStatusPanel :online="true" :queue-count="2" last-sync="2026-08-01T10:00:00Z" />
      <div class="row">
        <BaseButton @click="modalOpen = true">Open modal</BaseButton>
        <BaseButton variant="secondary" @click="drawerOpen = true">Open drawer</BaseButton>
      </div>
      <Modal v-model:open="modalOpen" title="Modal title">
        <p>Modal body</p>
        <template #footer>
          <BaseButton @click="modalOpen = false">Close</BaseButton>
        </template>
      </Modal>
      <Drawer v-model:open="drawerOpen" title="Drawer">
        <p>Drawer body</p>
      </Drawer>
    </div>

    <div v-show="tab === 'layout'" class="stack">
      <Accordion
        :items="[
          { id: '1', title: 'Section A', body: 'Accordion body A' },
          { id: '2', title: 'Section B', body: 'Accordion body B' },
        ]"
      />
      <SplitPane>
        <template #primary><p>Primary pane</p></template>
        <template #secondary><p>Secondary pane</p></template>
      </SplitPane>
    </div>
  </section>
</template>

<style scoped>
.block {
  margin-block-end: var(--space-5);
}
.stack {
  display: grid;
  gap: var(--space-4);
  margin-block-start: var(--space-4);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.swatch {
  width: 7rem;
  height: 4rem;
  border-radius: var(--radius-md);
  display: grid;
  place-items: end start;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: 600;
}
.swatch.primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.swatch.success {
  background: var(--color-success);
  color: var(--color-on-success);
}
.swatch.warning {
  background: var(--color-warning);
  color: var(--color-on-warning);
}
.swatch.danger {
  background: var(--color-danger);
  color: var(--color-on-danger);
}
.swatch.surface {
  background: var(--color-surface);
  color: var(--color-text);
}
.raw {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.65rem 0.8rem;
  background: var(--color-surface);
  color: var(--color-text);
}
.hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
