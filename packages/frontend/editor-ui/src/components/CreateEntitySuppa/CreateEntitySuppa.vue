<script setup lang="ts">
import { ElSelect } from 'element-plus';
import type { PropType } from 'vue';
import type { EventBus } from '@n8n/utils/event-bus';
import { createEventBus } from '@n8n/utils/event-bus';
import { computed, ref, onMounted, nextTick } from 'vue';
import type { INodeUi, IUpdateInformation } from '@/Interface';

import type {
	ILoadOptions,
	INodeParameters,
	INodeProperties,
	INodePropertyOptions,
	NodeParameterValueType,
} from 'n8n-workflow';

import { isResourceLocatorValue } from 'n8n-workflow';

import type { SelectSize } from '@n8n/design-system/types';
import { useWorkflowHelpers } from '@/composables/useWorkflowHelpers';

import {
	formatAsExpression,
	getParameterTypeOption,
	isValidParameterOption,
} from '@/utils/nodeSettingsUtils';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { N8nIcon, N8nInput, N8nInputLabel, N8nOption, N8nSelect } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useUIStore } from '@/stores/ui.store';
import { useNDVStore } from '@/stores/ndv.store';
import DraggableTarget from '@/components/DraggableTarget.vue';
import { getMappedResult } from '@/utils/mappingUtils';
import { hasExpressionMapping, isValueExpression } from '@/utils/nodeTypesUtils';
import get from 'lodash/get';
import debounce from 'lodash/debounce';
import { completeExpressionSyntax, shouldConvertToExpression } from '@/utils/expressions';
import { ElSwitch, ElInputNumber, ElDatePicker, ElInput } from 'element-plus';
import ParameterOptions from '@/components/ParameterOptions.vue';
import ExpressionParameterInput from '@/components/ExpressionParameterInput.vue';
import { useToast } from '@/composables/useToast';

type InnerSelectRef = InstanceType<typeof ElSelect>;

type FieldItem = {
	field: string;
	displayName?: string;
	type?: string;
	entityId?: string;
	multiple?: boolean;
	value?:
		| string
		| number
		| boolean
		| null
		| INodePropertyOptions
		| Array<INodePropertyOptions | string | number | boolean | null>;
};

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
		type: Array as PropType<FieldItem[]>,
		default: () => [],
	},
	parameter: {
		type: Object as PropType<INodeProperties>,
		required: true,
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
	drop: [expression: string];
	textInput: [update: IUpdateInformation];
	update: [payload: any];
	'update:modelValue': [value: FieldItem[]];
}>();

const innerSelect = ref<InnerSelectRef | null>(null);
const inputField = ref<InstanceType<typeof N8nSelect> | null>(null);

const i18n = useI18n();
const uiStore = useUIStore();
const ndvStore = useNDVStore();
const toast = useToast();

const workflowHelpers = useWorkflowHelpers();
const nodeTypesStore = useNodeTypesStore();

const remoteParameterOptions = ref<INodePropertyOptions[]>([]);
const remoteParameterOptionsLoading = ref(false);
const remoteParameterOptionsLoadingIssues = ref<string | null>(null);
const fieldSelectOptions = ref<Record<string, INodePropertyOptions[]>>({});
const fieldSelectOptionsLoading = ref<Record<string, boolean>>({});
const fieldLastQuery = ref<Record<string, string>>({});

// Заглушки для используемых в шаблоне переменных/методов
const shouldRedactValue = false;

function getTypeOption<T>(optionName: string): T {
	return getParameterTypeOption<T>(props.parameter, optionName);
}

async function loadRemoteParameterOptions() {
	if (!props.node || !props.parameter) return;
	remoteParameterOptionsLoadingIssues.value = null;
	remoteParameterOptionsLoading.value = true;
	remoteParameterOptions.value.length = 0;
	try {
		const currentNodeParameters = (props.node as INodeUi).parameters;
		const resolvedNodeParameters = workflowHelpers.resolveRequiredParameters(
			props.parameter,
			currentNodeParameters,
		) as INodeParameters;
		const loadOptionsMethod = getTypeOption<string | undefined>('loadOptionsMethod');
		const loadOptions = getTypeOption<ILoadOptions | undefined>('loadOptions');
		const options = await nodeTypesStore.getNodeParameterOptions({
			nodeTypeAndVersion: {
				name: props.node.type,
				version: props.node.typeVersion,
			},
			path: props.path,
			methodName: loadOptionsMethod,
			loadOptions,
			currentNodeParameters: resolvedNodeParameters,
			credentials: props.node.credentials,
		});
		remoteParameterOptions.value = remoteParameterOptions.value.concat(options);
	} catch (error: unknown) {
		remoteParameterOptionsLoadingIssues.value =
			error instanceof Error ? error.message : String(error);
	}
	remoteParameterOptionsLoading.value = false;
}

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
		// Применяем только если это актуальный результат
		if (fieldLastQuery.value[fieldName] === currentQuery) {
			fieldSelectOptions.value[fieldName] = options;
		}
	} catch (error: unknown) {
		remoteParameterOptionsLoadingIssues.value =
			error instanceof Error ? error.message : String(error);
	}
	// Сбрасываем загрузку только если актуально
	if (fieldLastQuery.value[fieldName] === currentQuery) {
		fieldSelectOptionsLoading.value[fieldName] = false;
	}
}

function getOptionsOptionDisplayName(option: INodePropertyOptions): string {
	return props.isForCredential
		? i18n.credText(uiStore.activeCredentialType).optionsOptionDisplayName(props.parameter, option)
		: i18n
				.nodeText(ndvStore.activeNode?.type)
				.optionsOptionDisplayName(props.parameter, option, props.path);
}

function getOptionsOptionDescription(option: INodePropertyOptions): string {
	return props.isForCredential
		? i18n.credText(uiStore.activeCredentialType).optionsOptionDescription(props.parameter, option)
		: i18n
				.nodeText(ndvStore.activeNode?.type)
				.optionsOptionDescription(props.parameter, option, props.path);
}

const getRemoteParameterOptions = computed(() => {
	const options = remoteParameterOptions.value || [];
	const currentValue = props.modelValue;
	if (!Array.isArray(currentValue) || currentValue.length === 0) return options;
	return options.filter((option) => {
		if (!option || !option.value) return true;
		return !currentValue.some((selected: FieldItem) => selected && selected.field === option.value);
	});
});

const parameterOptions = computed(() => {
	const options = getRemoteParameterOptions.value;
	if (!options || !Array.isArray(options)) return [] as INodePropertyOptions[];
	return options.filter(isValidParameterOption);
});

function valueChanged(untypedValue: unknown) {
	if (remoteParameterOptionsLoading.value) return;
	const oldValue = get(props.node, props.path) as unknown;
	if (oldValue !== undefined && oldValue === untypedValue) return;
	let value: NodeParameterValueType;
	if (untypedValue instanceof Date) value = untypedValue.toISOString();
	else if (
		typeof untypedValue === 'string' ||
		typeof untypedValue === 'number' ||
		typeof untypedValue === 'boolean' ||
		untypedValue === null ||
		Array.isArray(untypedValue)
	) {
		value = untypedValue;
	} else if (typeof untypedValue === 'object' && untypedValue !== null && '__rl' in untypedValue) {
		value = untypedValue as NodeParameterValueType;
	} else {
		value = untypedValue as NodeParameterValueType;
	}
	const isSpecializedEditor = props.parameter.typeOptions?.editor !== undefined;
	if (
		!oldValue &&
		oldValue !== undefined &&
		shouldConvertToExpression(value, isSpecializedEditor)
	) {
		value = ('=' + value) as NodeParameterValueType;
	}
	value = completeExpressionSyntax(value, isSpecializedEditor);
	const parameterData: IUpdateInformation = {
		node: props.node.name,
		name: props.path,
		value,
	};
	emit('update', parameterData);
}

async function setFocus() {
	await nextTick();
	emit('focus');
}

async function optionSelected(command: string) {
	switch (command) {
		case 'resetValue':
			return valueChanged(props.parameter.default as unknown as NodeParameterValueType);
		case 'addExpression':
			valueChanged(formatAsExpression(props.modelValue, props.parameter.type));
			await setFocus();
			break;
		case 'refreshOptions':
			void loadRemoteParameterOptions();
			return;
	}
}

onMounted(async () => {
	props.eventBus.on('optionSelected', optionSelected);
	await loadRemoteParameterOptions();
});

const focus = () => {
	innerSelect.value?.focus();
};

const blur = () => {
	innerSelect.value?.blur();
};

const focusOnInput = () => {
	if (!innerSelect.value) return;
	const inputRef = innerSelect.value.$refs.selectWrapper as HTMLInputElement;
	const inputElement = inputRef?.querySelector('input');
	if (inputElement) inputElement.focus();
	else inputRef?.focus();
};

const getDefaultValueForOption = (value: string): FieldItem | '' => {
	const found = remoteParameterOptions.value.find((option) => option.value === value);
	if (found) {
		return {
			field: String(found.value),
			displayName: found.name,
			multiple: (found as unknown as { multiple?: boolean }).multiple ?? false,
			type: (found as unknown as { type?: string }).type ?? 'string',
			entityId: (found as unknown as { entityId?: string }).entityId,
			value: undefined,
		};
	}
	return '';
};

const valueChangedCustom = async (value: string) => {
	const newField = getDefaultValueForOption(value);
	if (newField === '') return;
	if (Array.isArray(props.modelValue)) {
		emit('update', [...props.modelValue, newField]);
	} else {
		emit('update', [newField]);
	}
};

const onBlur = () => {
	emit('blur');
};

const onBlurInput = () => {
	emit('blur');
	emit('update', props.modelValue);
};

const setFocusSelect = (item: FieldItem) => {
	emit('focus');
	void loadFieldSelectOptions(item.field, item.entityId);
};

const updateInputValue = (item: FieldItem, value: string) => {
	// Для типів, що мають спеціальні UI (boolean/number/date/json),
	// оновлення відбувається через окремі обробники. Тут — дефолт: зберігаємо як рядок.
	item.value = value;
};

const getStringInputType = computed(() => {
	if (getTypeOption('password') === true) return 'password';
	return 'text';
});

const isRemoteParameterOption = (option: INodePropertyOptions): boolean => {
	return option && typeof option === 'object' && 'value' in option;
};

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

function onRemoteSearch(item: FieldItem, query: string) {
	const loader = getFieldDebouncedLoader(item.field, item.entityId);
	loader(query);
}

function getRelationModelValue(item: FieldItem) {
	const v = item.value as unknown;
	if (item.multiple) {
		// Для multi-select возвращаем массив значений
		if (Array.isArray(v)) {
			return v.map((entry) => {
				if (entry && typeof entry === 'object' && 'value' in (entry as Record<string, unknown>)) {
					return (entry as INodePropertyOptions).value as string | number | boolean | null;
				}
				return entry as string | number | boolean | null;
			});
		}
		// если сохранено одиночне значення/об'єкт — оборачиваем в масив
		if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
			return [(v as INodePropertyOptions).value as string | number | boolean | null];
		}
		return v !== null && v !== undefined ? [v as string | number | boolean | null] : [];
	}
	// single-select
	if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
		return (v as INodePropertyOptions).value as string | number | boolean | null;
	}
	return v as string | number | boolean | null | undefined;
}

function onRelationSelect(
	item: FieldItem,
	selected: string | number | boolean | null | Array<string | number | boolean | null>,
) {
	const options = fieldSelectOptions.value[item.field] || [];

	if (item.multiple) {
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

		const updatedItems = (props.modelValue as FieldItem[]).map((i: FieldItem) =>
			i.field === item.field ? { ...i, value: selectedOptions } : i,
		);
		emit('update', updatedItems);
		return;
	}

	// single-select
	const selectedOption = options.find((o) => o.value === selected);
	const updatedItems = (props.modelValue as FieldItem[]).map((i: FieldItem) =>
		i.field === item.field ? { ...i, value: selectedOption ?? selected } : i,
	);
	emit('update', updatedItems);
}

function isType(item: FieldItem, typeName: string) {
	return String(item.type || '').toLowerCase() === typeName.toLowerCase();
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
	return d.toISOString();
}

function toDateObj(raw: unknown): Date | null {
	if (!raw) return null;
	if (raw instanceof Date) return raw;
	const d = new Date(String(raw));
	return Number.isNaN(d.getTime()) ? null : d;
}

function onBooleanChanged(item: FieldItem, val: boolean) {
	item.value = !!val;
	emit('update', props.modelValue);
}

function onNumberChanged(item: FieldItem, val: number | null) {
	const t = String(item.type || '').toLowerCase();
	item.value = t === 'integer' ? toInteger(val) : toFloat(val);
	emit('update', props.modelValue);
}

function onDatePicked(item: FieldItem, val: Date | null, kind: 'date' | 'datetime') {
	if (!val) {
		item.value = '';
	} else {
		item.value = kind === 'date' ? toISODate(val) : toISODateTime(val);
	}
	emit('update', props.modelValue);
}

function onJsonChanged(item: FieldItem, raw: string) {
	// Парсимо одразу; якщо не вдалось — зберігаємо як рядок
	const parsed = toJSONValue(raw);
	item.value = parsed as any;
}

function onJsonBlur() {
	emit('update', props.modelValue);
}

function isExpressionItem(item: FieldItem) {
	// return typeof item.value === 'string' && String(item.value).startsWith('=');
	return forceShowExpression.value[item.field] === true;
}

const expressionDisplayValue = (item) => {
	if (forceShowExpression.value[item.field]) {
		return '';
	}

	const value = isResourceLocatorValue(item.value) ? item.value.value : item.value;
	if (typeof value === 'string' && value.startsWith('=')) {
		return value.slice(1);
	}

	return `${item.value ?? ''}`;
};

function onDropToItem(event: DragEvent, item: FieldItem) {
	if (!event || !event.dataTransfer) return;
	event.preventDefault();
	let text = '';
	try {
		text = event.dataTransfer.getData('text/plain') || '';
		if (!text) {
			const allTypes = Array.from(event.dataTransfer.types || []);
			for (const t of allTypes) {
				const v = event.dataTransfer.getData(t);
				if (v) {
					text = v;
					break;
				}
			}
		}
	} catch {}
	if (!text) return;
	// перетворюємо у вираз n8n
	const expr = formatAsExpression(text, 'string');
	item.value = expr as unknown as string;
	emit('update', props.modelValue);
}

// === Added for per-field expressions & drag mapping ===
const forceShowExpression = ref<Record<string, boolean>>({});

function ensureExpression(val: string) {
	return val.startsWith('=') ? val : '=' + val;
}

function applyComputed(item: FieldItem, opt: ComputedOption) {
	item.value = ensureExpression(opt.expression) as unknown as string;
	emit('update', props.modelValue);
}

function enableExpression(item: FieldItem) {
	const key = item.field;
	forceShowExpression.value[key] = true;
	if (typeof item.value !== 'string') {
		item.value = '={{}}' as unknown as string;
	}
}

function clearExpression(item: FieldItem) {
	const key = item.field;
	forceShowExpression.value[key] = false;
	if (typeof item.value === 'string' && isValueExpression(props.parameter, item.value as string)) {
		item.value = (item.value as string).replace(/^=/, '') as unknown as string;
	}
	emit('update', props.modelValue);
}

function onDropMapping(raw: string, item: FieldItem, _event: MouseEvent) {
	// Don't stop propagation here — Draggable.vue relies on window mouseup to end dragging
	_event.stopPropagation();
	// event.preventDefault();
	const current = item.value as unknown as string | number | boolean | null;
	let updated: string;
	try {
		const mapped = getMappedResult(props.parameter as any, raw, current as unknown as any);
		updated = typeof mapped === 'string' ? mapped : String(mapped);
	} catch (e) {
		updated = ensureExpression(raw);
	}
	forceShowExpression.value[item.field] = true;

	setTimeout(() => {
		if (props.node) {
			props.eventBus.emit('drop', updated);

			if (!ndvStore.isMappingOnboarded) {
				toast.showMessage({
					title: i18n.baseText('dataMapping.success.title'),
					message: i18n.baseText('dataMapping.success.moreInfo'),
					type: 'success',
				});

				ndvStore.setMappingOnboarded();
			}

			ndvStore.setMappingTelemetry({
				dest_node_type: props.node.type,
				dest_parameter: props.path,
				dest_parameter_mode: 'expression',
				dest_parameter_empty: '',
				dest_parameter_had_mapping: true,
				success: true,
			});

			// Apply the mapped value to the item and emit the update once
			item.value = updated as unknown as string;

			emit('update', props.modelValue);
			// Safety net: ensure draggable state is reset so the preview pill doesn't stick to cursor
			ndvStore.draggableStopDragging();
		}
	}, 200);
}

// === End added ===

function onOptionSelected(cmd: string, item: FieldItem) {
	if (cmd === 'addExpression') {
		enableExpression(item);
	} else if (cmd === 'resetValue') {
		clearExpression(item);
	} else if (cmd === 'removeExpression') {
		clearExpression(item);
	}
}

defineExpose({
	focus,
	blur,
	focusOnInput,
	innerSelect,
});
</script>

<template>
	<div
		:class="{
			'n8n-select': true,
			[$style.container]: true,
			[$style.withPrepend]: !!$slots.prepend,
		}"
		style="display: flex; flex-direction: column"
	>
		<div v-if="$slots.prepend" :class="$style.prepend">
			<slot name="prepend" />
		</div>
		<div style="flex-grow: 1; width: 100%; display: flex; flex-direction: column; width: 100%">
			<template v-if="Array.isArray(modelValue)">
				<div
					v-for="item in modelValue"
					:key="item.field"
					style="
						margin: 10px 0;
						display: flex;
						justify-content: space-between;
						align-items: center;
						width: 100%;
					"
				>
					<N8nInputLabel
						ref="inputLabel"
						:class="[$style.wrapper]"
						style="width: 100%"
						:label="item.displayName || item.field"
						:bold="true"
					>
						<template #options>
							<ParameterOptions
								:parameter="parameter"
								:value="item.value"
								:is-read-only="false"
								:show-options="false"
								:show-expression-selector="true"
								:is-content-overridden="true"
								@update:model-value="(val) => onOptionSelected(val, item as FieldItem)"
							/>
						</template>
						<DraggableTarget
							type="mapping"
							sticky
							:sticky-offset="[3, 3]"
							style="flex: 1"
							@drop="
								(payload: string, event: MouseEvent) =>
									onDropMapping(payload, item as FieldItem, event)
							"
						>
							<ExpressionParameterInput
								v-if="isValueExpression(parameter, item.value)"
								ref="inputField"
								:model-value="expressionDisplayValue(item)"
								:path="path"
								:event-bus="eventBus"
								@update:model-value="expressionUpdated"
								@modal-opener-click="openExpressionEditorModal"
								@focus="setFocus"
								@blur="onBlur"
							/>

							<N8nSelect
								v-else-if="item.type === 'relation' && !isExpressionItem(item as FieldItem)"
								:size="size"
								filterable
								:remote="true"
								:remote-method="(q: string) => onRemoteSearch(item as FieldItem, q)"
								:multiple="item.multiple === true"
								:model-value="getRelationModelValue(item as FieldItem)"
								:loading="fieldSelectOptionsLoading[item.field]"
								title="Value"
								@update:model-value="(value) => onRelationSelect(item as FieldItem, value)"
								@keydown.stop
								@focus="setFocusSelect(item as FieldItem)"
							>
								<N8nOption
									v-for="option in fieldSelectOptions[item.field] || []"
									:key="option.value.toString()"
									:value="option.value"
									:label="getOptionsOptionDisplayName(option)"
									data-test-id="parameter-input-item"
								>
									<div class="list-option">
										<div
											class="option-headline"
											:class="{ 'remote-parameter-option': isRemoteParameterOption(option) }"
										>
											{{ getOptionsOptionDisplayName(option) }}
										</div>
										<div
											v-if="option.description"
											v-n8n-html="getOptionsOptionDescription(option)"
											class="option-description"
										></div>
									</div>
								</N8nOption>
							</N8nSelect>

							<ElSwitch
								v-else-if="
									isType(item as FieldItem, 'boolean') && !isExpressionItem(item as FieldItem)
								"
								:model-value="toBoolean(item.value as any)"
								@update:model-value="(val: boolean) => onBooleanChanged(item as FieldItem, val)"
							/>

							<ElInputNumber
								v-else-if="
									(isType(item as FieldItem, 'integer') || isType(item as FieldItem, 'float')) &&
									!isExpressionItem(item as FieldItem)
								"
								:precision="isType(item as FieldItem, 'integer') ? 0 : undefined"
								:step="isType(item as FieldItem, 'integer') ? 1 : 0.1"
								:model-value="
									isType(item as FieldItem, 'integer') ? toInteger(item.value) : toFloat(item.value)
								"
								@update:model-value="
									(val: number | null) => onNumberChanged(item as FieldItem, val)
								"
							/>

							<ElDatePicker
								v-else-if="
									isType(item as FieldItem, 'date') && !isExpressionItem(item as FieldItem)
								"
								type="date"
								:model-value="toDateObj(item.value)"
								@update:model-value="(d: Date | null) => onDatePicked(item as FieldItem, d, 'date')"
							/>

							<ElDatePicker
								v-else-if="
									isType(item as FieldItem, 'datetime') && !isExpressionItem(item as FieldItem)
								"
								type="datetime"
								:model-value="toDateObj(item.value)"
								@update:model-value="
									(d: Date | null) => onDatePicked(item as FieldItem, d, 'datetime')
								"
							/>

							<ElInput
								v-else-if="
									isType(item as FieldItem, 'json') && !isExpressionItem(item as FieldItem)
								"
								type="textarea"
								autosize
								:model-value="
									typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)
								"
								@update:model-value="(val: string) => onJsonChanged(item as FieldItem, val)"
								@blur="onJsonBlur"
							/>

							<N8nInput
								v-else
								:model-value="item.value"
								:class="{ 'input-with-opener': true, 'ph-no-capture': shouldRedactValue }"
								:size="size"
								:type="getStringInputType"
								placeholder="Enter value..."
								data-test-id="parameter-input-field"
								@update:model-value="(val) => updateInputValue(item as FieldItem, val)"
								@keydown.stop
								@focus="setFocus"
								@blur="onBlurInput"
								@paste="onPaste"
							/>
						</DraggableTarget>
					</N8nInputLabel>
				</div>
			</template>
		</div>
		<N8nSelect
			ref="inputField"
			:size="size"
			filterable
			:placeholder="'Add field...'"
			:loading="remoteParameterOptionsLoading"
			@update:model-value="valueChangedCustom"
			@keydown.stop
			@blur="onBlur"
		>
			<N8nOption
				v-for="option in parameterOptions"
				:key="option.value.toString()"
				:value="option.value"
				:label="getOptionsOptionDisplayName(option)"
				data-test-id="parameter-input-item"
			>
				<div class="list-option">
					<div
						class="option-headline"
						:class="{ 'remote-parameter-option': isRemoteParameterOption(option) }"
					>
						{{ getOptionsOptionDisplayName(option) }}
					</div>
					<div
						v-if="option.description"
						v-n8n-html="getOptionsOptionDescription(option)"
						class="option-description"
					></div>
				</div>
			</N8nOption>
		</N8nSelect>
	</div>
</template>

<style lang="scss" module>
.xlarge {
	--input-font-size: var(--font-size-m);

	input {
		height: 48px;
	}
}

.container {
	display: inline-flex;
	width: 100%;
}

.withPrepend {
	input {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
		@-moz-document url-prefix() {
			padding: 0 var(--spacing-3xs);
		}
	}
}

.prepend {
	font-size: var(--font-size-2xs);
	border: var(--border-base);
	border-right: none;
	display: flex;
	align-items: center;
	padding: 0 var(--spacing-3xs);
	background-color: var(--color-background-light);
	border-bottom-left-radius: var(--input-border-radius, var(--border-radius-base));
	border-top-left-radius: var(--input-border-radius, var(--border-radius-base));
	color: var(--color-text-base);
	white-space: nowrap;
}
</style>
