<script setup lang="ts">
import type {
	ILoadOptions,
	INodeParameters,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { ElButton, ElOption, ElSelect } from 'element-plus';
import { nextTick, PropType } from 'vue';
import { computed, onMounted, ref } from 'vue';
import type { EventBus } from '@n8n/utils/event-bus';
import { createEventBus } from '@n8n/utils/event-bus';
import type { INodeUi, IUpdateInformation } from '@/Interface';
import type { SelectSize } from '@n8n/design-system';
import { N8nOption, N8nSelect } from '@n8n/design-system';
import type { IFilterGroupSuppa } from '@/components/FilterGeneratorSuppa/interfases/IFilterGroupSuppa';
import { useWorkflowHelpers } from '@/composables/useWorkflowHelpers';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { getParameterTypeOption, isValidParameterOption } from '@/utils/nodeSettingsUtils';
import { useI18n } from '@n8n/i18n';
import { useUIStore } from '@/stores/ui.store';
import { useNDVStore } from '@/stores/ndv.store';
import { IFilterItemSuppa } from '@/components/FilterGeneratorSuppa/interfases/IFilterItemSuppa';
import debounce from 'lodash/debounce';

type ComputedOption = { label: string; expression: string };

const props = defineProps({
	...ElSelect.props,
	parameter: {
		type: Object as PropType<INodeProperties>,
		required: true,
	},
	path: {
		type: String,
		required: true,
	},
	eventBus: {
		type: Object as PropType<EventBus>,
		required: false,
		default: () => createEventBus(),
	},
	modelValue: {
		type: Object as PropType<IFilterItemSuppa>,
		default: () => {},
	},
	node: {
		type: Object as PropType<INodeUi>,
		required: true,
	},
	size: {
		type: String as PropType<SelectSize>,
		default: 'large',
	},
	isForCredential: {
		type: Boolean,
		default: false,
	},
	computedOptions: {
		type: Object as PropType<Record<string, ComputedOption[]>>,
		default: () => ({}),
	},
});

const emit = defineEmits<{
	focus: [];
	blur: [];
	remove: [];
	drop: [expression: string];
	textInput: [update: IUpdateInformation];
	update: [payload: unknown];
	'update:modelValue': [value: IFilterItemSuppa];
}>();

const i18n = useI18n();
const uiStore = useUIStore();
const ndvStore = useNDVStore();

const workflowHelpers = useWorkflowHelpers();
const nodeTypesStore = useNodeTypesStore();

const item = ref<IFilterItemSuppa>(props.modelValue as IFilterItemSuppa);

const remoteParameterOptions = ref<INodePropertyOptions[]>([]);
const remoteParameterOptionsLoading = ref(false);
const remoteParameterOptionsLoadingIssues = ref<string | null>(null);
const fieldSelectOptions = ref<Record<string, INodePropertyOptions[]>>({});
const fieldSelectOptionsLoading = ref<Record<string, boolean>>({});
const fieldLastQuery = ref<Record<string, string>>({});

// ------- helpers -------
function getTypeOption<T>(optionName: string): T {
	return getParameterTypeOption<T>(props.parameter, optionName);
}

const getStringInputType = computed(() =>
	getTypeOption('password') === true ? 'password' : 'text',
);

function isExpressionItem(item: IFilterItemSuppa) {
	return false;
}

const checkComparator = computed(() => {
	if (!item.value.comparator) return false;
	if (item.value.comparator === 'empty' || item.value.comparator === 'not empty') return false;
	return true;
});

const updateInputValue = (item: IFilterItemSuppa, value: string) => {
	item.value = value;
};

async function setFocus() {
	await nextTick();
	emit('focus');
}

const onBlurInput = () => {
	emit('blur');
	emit('update', item.value);
};

function onJsonBlur() {
	emit('update', item.value);
}

const removeField = () => {
	emit('remove');
};

async function loadFieldSelectOptions(fieldName: string, entityId?: string, searchQuery?: string) {
	if (!props.node || !props.parameter) return;
	fieldSelectOptionsLoading.value[fieldName] = true;
	fieldSelectOptions.value[fieldName] = [];
	const currentQuery = searchQuery ?? '';
	fieldLastQuery.value[fieldName] = currentQuery;
	try {
		const currentNodeParameters = (props.node as INodeUi).parameters;
		const resolvedNodeParameters = workflowHelpers.resolveRequiredParameters(
			props.parameter,
			currentNodeParameters,
		) as INodeParameters;
		const loadOptionsMethod = getTypeOption<string | undefined>('loadFieldSelectOptionsMethod');
		const loadOptions = getTypeOption<ILoadOptions | undefined>('loadOptions');
		const options = await nodeTypesStore.getNodeParameterOptions({
			nodeTypeAndVersion: {
				name: props.node.type,
				version: props.node.typeVersion,
			},
			path: props.path,
			methodName: loadOptionsMethod,
			loadOptions,
			currentNodeParameters: {
				...resolvedNodeParameters,
				fieldName,
				entityId,
				search: currentQuery,
			},
			credentials: props.node.credentials,
		});
		if (fieldLastQuery.value[fieldName] === currentQuery) {
			fieldSelectOptions.value[fieldName] = options;
		}
	} catch (error: unknown) {
		remoteParameterOptionsLoadingIssues.value =
			error instanceof Error ? error.message : String(error);
	}
	if (fieldLastQuery.value[fieldName] === currentQuery) {
		fieldSelectOptionsLoading.value[fieldName] = false;
	}
}

async function loadCustomEntityOptions(fieldName: string, enumId?: string) {
	if (!props.node || !props.parameter) return;
	fieldSelectOptionsLoading.value[fieldName] = true;
	fieldSelectOptions.value[fieldName] = [];
	try {
		const currentNodeParameters = (props.node as INodeUi).parameters;
		const resolvedNodeParameters = workflowHelpers.resolveRequiredParameters(
			props.parameter,
			currentNodeParameters,
		) as INodeParameters;
		const loadOptionsMethod = getTypeOption<string | undefined>('loadEnumOptionsMethod');
		const loadOptions = getTypeOption<ILoadOptions | undefined>('loadOptions');
		const options = await nodeTypesStore.getNodeParameterOptions({
			nodeTypeAndVersion: {
				name: props.node.type,
				version: props.node.typeVersion,
			},
			path: props.path,
			methodName: loadOptionsMethod,
			loadOptions,
			currentNodeParameters: {
				...resolvedNodeParameters,
				fieldName,
				enumId,
			},
			credentials: props.node.credentials,
		});
		fieldSelectOptions.value[fieldName] = options;
	} catch (error: unknown) {
		remoteParameterOptionsLoadingIssues.value =
			error instanceof Error ? error.message : String(error);
	}
	fieldSelectOptionsLoading.value[fieldName] = false;
}

const fieldSearchDebouncers = new Map<string, (q: string) => void>();

function getFieldDebouncedLoader(fieldName: string, entityId?: string) {
	let loader = fieldSearchDebouncers.get(fieldName);
	if (!loader) {
		loader = debounce((q: string) => {
			void loadFieldSelectOptions(fieldName, entityId, q);
		}, 300);
		fieldSearchDebouncers.set(fieldName, loader);
	}
	return loader;
}

function onRemoteSearch(item: IFilterItemSuppa, query: string) {
	const loader = getFieldDebouncedLoader(item.field, item.prop.entityId);
	loader(query);
}

function getRelationModelValue() {
	const v = item.value.value as unknown;
	if (item.value.multiple) {
		if (Array.isArray(v)) {
			return v.map((entry) => {
				if (entry && typeof entry === 'object' && 'value' in (entry as Record<string, unknown>)) {
					return (entry as INodePropertyOptions).value as string | number | boolean | null;
				}
				return entry as string | number | boolean | null;
			});
		}
		if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
			return [(v as INodePropertyOptions).value as string | number | boolean | null];
		}
		return v !== null && v !== undefined ? [v as string | number | boolean | null] : [];
	}
	if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
		return (v as INodePropertyOptions).value as string | number | boolean | null;
	}
	return v as string | number | boolean | null | undefined;
}

function onRelationSelect(
	selected: string | number | boolean | null | Array<string | number | boolean | null>,
) {
	const options = fieldSelectOptions.value[item.value.field] || [];

	if (item.value.prop.multiple) {
		const selectedValues = Array.isArray(selected)
			? selected
			: selected !== null && selected !== undefined
				? [selected]
				: [];
		const selectedOptions = selectedValues
			.map((sv) => options.find((o) => o.value === sv) ?? sv)
			.map((entry) =>
				typeof entry === 'object' && entry !== null ? (entry as INodePropertyOptions) : entry,
			);

		item.value = selectedOptions;
		emit('update', item.value);
		return;
	}

	const selectedOption = options.find((o) => o.value === selected);
	item.value.value =
		typeof selectedOption === 'object' && selectedOption !== null
			? (selectedOption as INodePropertyOptions)
			: selected;
	emit('update', item.value);
}

function isType(el: IFilterItemSuppa, typeName: string) {
	return String(el.prop?.type || '').toLowerCase() === typeName.toLowerCase();
}

function toBoolean(raw: string | boolean | number | null | undefined) {
	const s = String(raw).trim().toLowerCase();
	return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function toInteger(raw: unknown) {
	if (raw === '' || raw === null || raw === undefined) return null;
	const n = Number.parseInt(String(raw), 10);
	return Number.isNaN(n) ? null : n;
}

function toFloat(raw: unknown) {
	if (raw === '' || raw === null || raw === undefined) return null;
	const n = Number.parseFloat(String(raw));
	return Number.isNaN(n) ? null : n;
}

function toJSONValue(raw: unknown) {
	if (raw === '' || raw === null || raw === undefined) return '';
	try {
		return JSON.parse(String(raw));
	} catch {
		return String(raw);
	}
}

function toISODate(raw: unknown) {
	if (!raw) return '';
	const d = raw instanceof Date ? raw : new Date(String(raw));
	if (Number.isNaN(d.getTime())) return String(raw);
	return d.toISOString().slice(0, 10);
}

function toISODateTime(raw: unknown) {
	if (!raw) return '';
	const d = raw instanceof Date ? raw : new Date(String(raw));
	if (Number.isNaN(d.getTime())) return String(raw);
	return d.getTime();
}

function toDateObj(raw: unknown): Date | null {
	if (raw === '' || raw === null || raw === undefined) return null;
	if (raw instanceof Date) return raw;

	// Числовой таймстемп: секунды или миллисекунды
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		const ms = raw < 1e12 ? raw * 1000 : raw;
		const dNum = new Date(ms);
		return Number.isNaN(dNum.getTime()) ? null : dNum;
	}

	// Строковый таймстемп
	if (typeof raw === 'string') {
		const s = raw.trim();
		if (s === '') return null;

		if (/^\d+$/.test(s)) {
			const n = Number(s);
			const ms = n < 1e12 ? n * 1000 : n;
			const dStrNum = new Date(ms);
			return Number.isNaN(dStrNum.getTime()) ? null : dStrNum;
		}

		const dStr = new Date(s);
		return Number.isNaN(dStr.getTime()) ? null : dStr;
	}

	const d = new Date(String(raw));
	return Number.isNaN(d.getTime()) ? null : d;
}

function toDateObjRange(raw: unknown): Date[] | null {
	if (raw === '' || raw === null || raw === undefined) return null;
	if (!Array.isArray(raw)) {
		const start = raw.start ? toDateObj(raw.start) : null;
		const end = raw.end ? toDateObj(raw.end) : null;
		return start || end ? ([start, end] as Date[]) : null;
	}
	if (raw.length === 0) return null;
	const start = toDateObj(raw[0]);
	const end = raw.length > 1 ? toDateObj(raw[1]) : start;
	return start || end ? ([start, end] as Date[]) : null;
}

function onBooleanChanged(val: boolean) {
	item.value.value = !!val;
	emit('update', item.value);
}

function onNumberChanged(val: number | null) {
	const t = String(item.value.prop.type || '').toLowerCase();
	item.value.value = t === 'integer' ? toInteger(val) : toFloat(val);
	emit('update', item.value);
}

function onDatePicked(val: Date | null, kind: 'date' | 'datetime') {
	if (!val) {
		item.value.value = '';
	} else {
		item.value.value = kind === 'date' ? toISODate(val) : toISODateTime(val);
	}
	emit('update', item.value);
}

function onDatePickedRange(val: Date[] | null, kind: 'date' | 'datetime') {
	if (!val || val.length === 0) {
		item.value.value = '';
	} else {
		const start = val[0];
		const end = val.length > 1 ? val[1] : start;
		item.value.value =
			kind === 'date'
				? {
						start: toISODate(start),
						end: toISODate(end),
					}
				: {
						start: toISODateTime(start),
						end: toISODateTime(end),
					};
	}
	emit('update', item.value);
}

function onJsonChanged(item: IFilterItemSuppa, raw: string) {
	const parsed = toJSONValue(raw);
	item.value = parsed as string;
}

const setFocusSelect = (item: IFilterItemSuppa) => {
	emit('focus');
	void loadFieldSelectOptions(item.field, item.prop.entityId);
};

const setFocusEnum = (item: IFilterItemSuppa) => {
	emit('focus');
	if (!fieldSelectOptions.value[item.field] || fieldSelectOptions.value[item.field].length === 0) {
		void loadCustomEntityOptions(item.field, item.prop.enumId);
	}
};

const isPeriodBeetwen = computed(() => item.value.comparator === 'between');
const isPeriodSelect = computed(() => item.value.comparator === 'period');

const comparators = computed(() => {
	const comparators = {
		number: ['eq', '<', '<=', '>', '>=', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		text: ['like', 'eq', '<>', 'not like', 'in list', 'not in list', 'empty', 'not empty'],
		richtext: ['like', 'eq', '<>', 'not like', 'in list', 'not in list', 'empty', 'not empty'],
		textarea: ['like', 'eq', '<>', 'not like', 'in list', 'not in list', 'empty', 'not empty'],
		relation: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		enum: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		select: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		radio: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		date: ['period', 'between', 'eq', '<', '<=', '>', '>=', '<>', 'empty', 'not empty'],
		String: ['like', 'eq', '<>', 'not like', 'in list', 'not in list', 'empty', 'not empty'],
		Date: [
			'eq',
			'<',
			'<=',
			'>',
			'>=',
			'<>',
			'in list',
			'not in list',
			'empty',
			'not empty',
			'period',
		],
		DateTime: [
			'eq',
			'<',
			'<=',
			'>',
			'>=',
			'<>',
			'in list',
			'not in list',
			'empty',
			'not empty',
			'between',
			'period',
		],
		Boolean: ['eq', '<>', 'empty', 'not empty'],
		Integer: ['eq', '<', '<=', '>', '>=', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		default: [
			'eq',
			'<',
			'<=',
			'>',
			'>=',
			'<>',
			'like',
			'not like',
			'in list',
			'not in list',
			'empty',
			'not empty',
		],
		UUID: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		inlineSelect: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		toogle: ['eq'],
		checkbox: ['eq'],
		extract: ['eq', '<', '<=', '>', '>=', '<>', 'in list', 'not in list'],
		menuPanel: ['eq', '<>', 'in list', 'not in list'],
		userSelect: ['eq', '<>', 'in list', 'not in list', 'empty', 'not empty'],
		tabs: ['in list'],
		buttonList: ['in list'],
	};
	const key = item.value.prop?.type || 'default';
	return comparators[key] || comparators['default'];
});

const periodOptions = [
	{ label: 'Today', value: 'today' },
	{ label: 'Yesterdat', value: 'yesterday' },
	{ label: 'This week', value: 'this_week' },
	{ label: 'Last week', value: 'last_week' },
	{ label: 'This month', value: 'this_month' },
	{ label: 'Last month', value: 'last_month' },
	{ label: 'This year', value: 'this_year' },
	{ label: 'Last year', value: 'last_year' },
];

const updateComparator = (value: string) => {
	item.value.comparator = value;
	item.value.comparator2 = value;
	emit('update', item.value);
};

const updateValue = (value: unknown) => {
	item.value.value = value;
	emit('update', item.value);
};

const isMiltiple = computed(
	() => item.value.comparator === 'in list' || item.value.comparator === 'not in list',
);
</script>
<template>
	<div class="suppa-filter-item-container">
		<N8nInputLabel ref="inputLabel" style="width: 100%" :label="item.field" :bold="true">
			<template #options>
				<!--				<ParameterOptions-->
				<!--					:parameter="parameter"-->
				<!--					:value="item.value"-->
				<!--					:is-read-only="false"-->
				<!--					:show-options="false"-->
				<!--					:show-expression-selector="true"-->
				<!--					:is-content-overridden="true"-->
				<!--					@update:model-value="(val) => onOptionSelected(val, item as FieldItem)"-->
				<!--				/>-->
				<N8nIconButton
					type="tertiary"
					size="mini"
					icon="node-trash"
					:aria-label="i18n.baseText('generic.remove')"
					style="margin-left: var(--spacing-3xs)"
					@click="removeField"
				/>
			</template>
			<div style="display: flex; flex-direction: row; gap: 10px">
				<ElSelect
					v-model="item.comparator"
					size="small"
					:disabled="isForCredential"
					style="width: 100px"
					@change="updateComparator"
				>
					<ElOption v-for="item in comparators" :key="item" :label="item" :value="item" />
				</ElSelect>

				<!-- ключове: блокуємо Vue-пропагацію drop тут -->
				<DraggableTarget
					v-if="checkComparator"
					type="mapping"
					sticky
					:sticky-offset="[3, 3]"
					style="flex: 1"
					@dragover.prevent
				>
					<!--				<ExpressionParameterInput-->
					<!--					v-if="isValueExpression(parameter, item.value)"-->
					<!--					ref="inputField"-->
					<!--					:model-value="expressionDisplayValue(item)"-->
					<!--					:path="path"-->
					<!--					:event-bus="eventBus"-->
					<!--					@update:model-value="expressionUpdated"-->
					<!--					@modal-opener-click="openExpressionEditorModal"-->
					<!--					@focus="setFocus"-->
					<!--					@blur="onBlur"-->
					<!--					@drop.stop="(payload: string, event: MouseEvent) => onDropMapping(payload, item as FieldItem, event)"-->
					<!--				/>-->

					<N8nSelect
						v-if="item.prop.type === 'relation' && !isExpressionItem(item as IFilterItemSuppa)"
						size="small"
						filterable
						:remote="true"
						:remote-method="(q: string) => onRemoteSearch(item as IFilterItemSuppa, q)"
						:multiple="isMiltiple"
						:model-value="getRelationModelValue()"
						:loading="fieldSelectOptionsLoading[item.field]"
						title="Value"
						@update:model-value="onRelationSelect"
						@keydown.stop
						@focus="setFocusSelect(item as IFilterItemSuppa)"
					>
						<N8nOption
							v-for="option in fieldSelectOptions[item.field] || (item.value && [item.value]) || []"
							:key="option.value.toString()"
							:value="option.value"
							:label="option.name"
							data-test-id="parameter-input-item"
						>
							<div class="list-option">
								<div class="option-headline">
									{{ option.name }}
								</div>
								<div
									v-if="option.description"
									v-n8n-html="option.name"
									class="option-description"
								></div>
							</div>
						</N8nOption>
					</N8nSelect>

					<N8nSelect
						v-else-if="
							item.prop.type === 'custom_enum' && !isExpressionItem(item as IFilterItemSuppa)
						"
						size="small"
						:multiple="isMiltiple"
						:model-value="getRelationModelValue()"
						:loading="fieldSelectOptionsLoading[item.field]"
						title="Value"
						@update:model-value="onRelationSelect"
						@keydown.stop
						@focus="setFocusEnum(item as IFilterItemSuppa)"
					>
						<N8nOption
							v-for="option in fieldSelectOptions[item.field] || (item.value && [item.value]) || []"
							:key="option.value.toString()"
							:value="option.value"
							:label="option.name"
							data-test-id="parameter-input-item"
						>
							<div class="list-option">
								<div class="option-headline">
									{{ option.name }}
								</div>
							</div>
						</N8nOption>
					</N8nSelect>

					<N8nSelect
						v-else-if="item.prop.type === 'enum' && !isExpressionItem(item as FieldItem)"
						size="small"
						:multiple="isMiltiple"
						:model-value="item.value"
						title="Value"
						@update:model-value="(value) => (item.value = value)"
						@keydown.stop
					>
						<N8nOption
							v-for="option in item.options || (item.value && [item.value]) || []"
							:key="option.value.toString()"
							:value="option.value"
							:label="option.name"
							data-test-id="parameter-input-item"
						>
							<div class="list-option">
								<div class="option-headline">
									{{ option.name }}
								</div>
							</div>
						</N8nOption>
					</N8nSelect>

					<ElSwitch
						v-else-if="
							isType(item as IFilterItemSuppa, 'boolean') &&
							!isExpressionItem(item as IFilterItemSuppa)
						"
						size="small"
						:model-value="toBoolean(item.value as any)"
						@update:model-value="onBooleanChanged"
					/>

					<ElInputNumber
						v-else-if="
							(isType(item as IFilterItemSuppa, 'integer') ||
								isType(item as IFilterItemSuppa, 'float')) &&
							!isExpressionItem(item as IFilterItemSuppa)
						"
						size="small"
						:precision="isType(item as IFilterItemSuppa, 'integer') ? 0 : undefined"
						:step="isType(item as IFilterItemSuppa, 'integer') ? 1 : 0.1"
						:model-value="
							isType(item as IFilterItemSuppa, 'integer')
								? toInteger(item.value)
								: toFloat(item.value)
						"
						@update:model-value="onNumberChanged"
					/>

					<ElDatePicker
						v-else-if="
							isType(item as IFilterItemSuppa, 'date') &&
							!isExpressionItem(item as IFilterItemSuppa) &&
							!isPeriodSelect
						"
						type="date"
						size="small"
						:model-value="toDateObj(item.value)"
						@update:model-value="(d: Date | null) => onDatePicked(d, 'date')"
					/>

					<ElDatePicker
						v-else-if="
							isType(item as IFilterItemSuppa, 'datetime') &&
							!isExpressionItem(item as IFilterItemSuppa) &&
							!isPeriodBeetwen &&
							!isPeriodSelect
						"
						type="datetime"
						size="small"
						:model-value="toDateObj(item.value)"
						@update:model-value="(d: Date | null) => onDatePicked(d, 'datetime')"
					/>

					<ElInput
						v-else-if="
							isType(item as IFilterItemSuppa, 'json') &&
							!isExpressionItem(item as IFilterItemSuppa)
						"
						type="textarea"
						size="small"
						autosize
						:model-value="
							typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)
						"
						@update:model-value="(val: string) => onJsonChanged(item as IFilterItemSuppa, val)"
						@blur="onJsonBlur"
					/>
					<template v-else-if="isPeriodBeetwen">
						<ElDatePicker
							type="daterange"
							:is-range="true"
							size="large"
							:model-value="toDateObjRange(item.value)"
							@update:model-value="(d: Date | null) => onDatePickedRange(d, 'datetime')"
						/>
					</template>
					<ElSelect
						v-else-if="isPeriodSelect"
						placeholder="Select period"
						v-model="item.value"
						size="small"
						:disabled="isForCredential"
						style="width: 100px"
						@change="updateValue"
					>
						<ElOption
							v-for="item in periodOptions"
							:key="item.value"
							:label="item.label"
							:value="item.value"
						/>
					</ElSelect>

					<N8nInput
						v-else
						:model-value="item.value"
						:class="{ 'input-with-opener': true }"
						size="small"
						:type="getStringInputType"
						placeholder="Enter value..."
						data-test-id="parameter-input-field"
						@update:model-value="(val) => updateInputValue(item as IFilterItemSuppa, val)"
						@keydown.stop
						@focus="setFocus"
						@blur="onBlurInput"
					/>
				</DraggableTarget>
			</div>
		</N8nInputLabel>
	</div>
</template>

<style lang="scss" scoped>
.suppa-filter-item-container {
	display: flex;
	flex-direction: row;
	gap: 10px;
	padding-bottom: 10px;
	border-bottom: 1px solid gray;
}
</style>
