<script setup lang="ts">
import type {
	ILoadOptions,
	INodeParameters,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { ElButton, ElOption, ElSelect } from 'element-plus';
import type { PropType } from 'vue';
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
		type: Object as PropType<IFilterGroupSuppa>,
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
	drop: [expression: string];
	textInput: [update: IUpdateInformation];
	update: [payload: unknown];
	'update:modelValue': [value: IFilterGroupSuppa];
}>();

const i18n = useI18n();
const uiStore = useUIStore();
const ndvStore = useNDVStore();

const workflowHelpers = useWorkflowHelpers();
const nodeTypesStore = useNodeTypesStore();

const remoteParameterOptions = ref<INodePropertyOptions[]>([]);
const remoteParameterOptionsLoading = ref(false);
const remoteParameterOptionsLoadingIssues = ref<string | null>(null);

// ------- texts -------
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

// ------- helpers -------
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
		remoteParameterOptions.value = options;
	} catch (error: unknown) {
		remoteParameterOptionsLoadingIssues.value =
			error instanceof Error ? error.message : String(error);
	}
	remoteParameterOptionsLoading.value = false;
}

const handleRemoveCondition = () => {
	emit('update', {});
};

const handleUpdateItem = (value: IFilterGroupSuppa, index: number, oldItem: IFilterGroupSuppa) => {
	const newConditions = [...(props.modelValue.conditions || [])];
	newConditions[index] = value;
	emit('update', {
		...props.modelValue,
		conditions: newConditions,
	});
};

const handleAddConjunction = () => {
	const newCondition: IFilterGroupSuppa = {
		type: 'conjunction',
		operator: 'and',
		conditions: [],
	};
	const newConditions = [...(props.modelValue.conditions || []), newCondition];
	emit('update', {
		...props.modelValue,
		conditions: newConditions,
	});
};

async function optionSelected(command: string) {
	switch (command) {
		case 'resetValue':
		// return valueChanged(props.parameter.default as unknown as NodeParameterValueType);
		case 'addExpression':
			// valueChanged(formatAsExpression(props.modelValue, props.parameter.type));
			// await setFocus();
			break;
		case 'refreshOptions':
			void loadRemoteParameterOptions();
			return;
	}
}

const isRemoteParameterOption = (option: INodePropertyOptions): boolean =>
	option && typeof option === 'object' && 'value' in option;

const valueChangedCustom = (value: string) => {
	const option = remoteParameterOptions.value.find((o) => o.value === value);
	if (!option || !isValidParameterOption(option)) return;
	const newItem = {
		field: value,
		prop: option,
		type: 'condition',
		comparator: null,
		value: null,
	};
	const newConditions = [...(props.modelValue.conditions || []), newItem];
	emit('update', {
		...props.modelValue,
		conditions: newConditions,
	});
};

const handleRemoveItem = (index: number) => {
	const newConditions = [...(props.modelValue.conditions || [])];
	newConditions.splice(index, 1);
	emit('update', {
		...props.modelValue,
		conditions: newConditions,
	});
};

onMounted(async () => {
	props.eventBus.on('optionSelected', optionSelected);
	await loadRemoteParameterOptions();
});
</script>
<template>
	<div class="suppa-filter-container">
		<div style="display: flex; align-items: center; gap: 10px">
			<div>Operator:</div>
			<ElSelect
				v-model="modelValue.operator"
				size="small"
				:disabled="isForCredential"
				style="width: 100px"
				@change="(value) => emit('update', { ...modelValue, operator: value })"
			>
				<ElOption v-for="item in ['and', 'or']" :key="item" :label="item" :value="item" />
			</ElSelect>
		</div>
		<div v-for="(item, index) in modelValue.conditions" :key="index">
			<FilterItemSuppa
				v-if="item?.type === 'condition'"
				:parameter="parameter"
				:path="`${path}.conditions.${index}`"
				:eventBus="eventBus"
				:modelValue="item"
				:node="node"
				:size="size"
				:isForCredential="isForCredential"
				:computedOptions="computedOptions"
				@update="(value) => handleUpdateItem(value, index, item)"
				@focus="(e) => emit('focus', e)"
				@blur="(e) => emit('blur', e)"
				@drop="(expression) => emit('drop', expression)"
				@remove="handleRemoveItem(index)"
			/>
			<FilterGroupSuppa
				v-if="item?.type === 'conjunction'"
				:parameter="parameter"
				:path="`${path}.conditions.${index}`"
				:eventBus="eventBus"
				:modelValue="item"
				:node="node"
				:size="size"
				:isForCredential="isForCredential"
				:computedOptions="computedOptions"
				@update="(value) => handleUpdateItem(value, index, item)"
				@focus="(e) => emit('focus', e)"
				@blur="(e) => emit('blur', e)"
				@drop="(expression) => emit('drop', expression)"
			/>
		</div>
		<N8nSelect
			ref="inputField"
			size="small"
			filterable
			placeholder="Add field..."
			:loading="remoteParameterOptionsLoading"
			@update:model-value="valueChangedCustom"
			@keydown.stop
			@blur="onBlur"
		>
			<N8nOption
				v-for="option in remoteParameterOptions"
				:key="option.value.toString()"
				:value="option.value"
				:label="option.name"
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
		<div>
			<ElButton :size="size" @click="handleAddConjunction"> Add Conjunction </ElButton>
			<ElButton
				v-if="modelValue?.type === 'conjunction'"
				type="danger"
				:size="size"
				@click="handleRemoveCondition"
			>
				Remove Conjunction
			</ElButton>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.suppa-filter-container {
	display: flex;
	flex-direction: column;
	gap: 10px;
	border: 1px solid #636262;
	border-radius: 7px;
	padding: 10px;
}
</style>
