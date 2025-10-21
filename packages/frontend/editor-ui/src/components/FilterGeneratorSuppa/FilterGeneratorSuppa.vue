<script setup lang="ts">
import type {
	ILoadOptions,
	INodeParameters,
	INodeProperties,
	INodePropertyOptions,
	NodeParameterValueType,
} from 'n8n-workflow';

import { ElSelect, ElButton } from 'element-plus';
import type { PropType } from 'vue';
import type { EventBus } from '@n8n/utils/event-bus';
import { createEventBus } from '@n8n/utils/event-bus';
import type { INodeUi, IUpdateInformation } from '@/Interface';
import type { SelectSize } from '@n8n/design-system';
import type { IFilterGroupSuppa } from '@/components/FilterGeneratorSuppa/interfases/IFilterGroupSuppa';

// type FieldItem = {
// 	field: string;
// 	displayName?: string;
// 	type?: string;
// 	entityId?: string;
// 	multiple?: boolean;
// 	value?:
// 		| string
// 		| number
// 		| boolean
// 		| null
// 		| INodePropertyOptions
// 		| Array<INodePropertyOptions | string | number | boolean | null>;
// };

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
		default: () => ({}),
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

const handleAddCondition = () => {
	const newCondition: IFilterGroupSuppa = {
		type: 'conjunction',
		operator: 'and',
		conditions: [],
	};
	emit('update', newCondition);
};

const handleUpdateFilter = (updatedFilter: IFilterGroupSuppa) => {
	debugger;
	emit('update', updatedFilter);
};
</script>
<template>
	<div class="suppa-filter-container">
		<FilterGroupSuppa
			v-if="props.modelValue?.type === 'conjunction'"
			:parameter="props.parameter"
			:path="props.path"
			:eventBus="props.eventBus"
			:modelValue="props.modelValue"
			:node="props.node"
			:size="props.size"
			:isForCredential="props.isForCredential"
			:computedOptions="props.computedOptions"
			@update="handleUpdateFilter"
		/>
		<div>
			<ElButton
				v-if="props.modelValue?.type !== 'conjunction'"
				type="success"
				:size="props.size"
				@click="handleAddCondition"
			>
				Add Conjunction
			</ElButton>
		</div>
	</div>
</template>

<style lang="scss" scoped>
.suppa-filter-container {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
</style>
