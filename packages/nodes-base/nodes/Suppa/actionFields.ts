import type { INodeProperties } from 'n8n-workflow';

export const actionFields: { [key: string]: INodeProperties[] } = {
	create: [
		{
			displayName: 'Data',
			name: 'data',
			type: 'createEntity',
			placeholder: 'Add field',
			default: [],
			typeOptions: {
				loadOptionsMethod: 'getTableFields',
				loadFieldSelectOptionsMethod: 'searchEntityData',
				loadEnumOptionsMethod: 'searchEnumOptions',
			},
			displayOptions: {
				show: {
					action: ['create', 'update'],
				},
			},
		},
		{
			displayName: 'Static Data',
			name: 'staticData',
			type: 'json',
			placeholder: 'Add Static Data',
			default: '{}',
			displayOptions: {
				show: {
					action: ['create', 'update'],
				},
			},
		},
	],
	getById: [
		{
			displayName: 'ID запису',
			name: 'recordId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'Введіть ID запису',
			description: 'Унікальний ідентифікатор запису для отримання',
		},
	],

	getByFilter: [
		{
			displayName: 'Фільтри',
			name: 'filters',
			type: 'filterGeneratorSuppa',
			default: '{}',
			placeholder: '',
			description: "JSON об'єкт з фільтрами для пошуку записів",
			typeOptions: {
				loadOptionsMethod: 'getTableFields',
				loadFieldSelectOptionsMethod: 'searchEntityData',
				loadEnumOptionsMethod: 'searchEnumOptions',
			},
		},
		{
			displayName: 'Filters (Advanced)',
			name: 'filtersAdvanced',
			type: 'json',
			default: '{}',
			placeholder: '',
			description: "JSON об'єкт з фільтрами для пошуку записів",
		},
		{
			displayName: 'Поля для отримання',
			name: 'fields',
			type: 'multiOptions',
			displayOptions: {
				hide: {
					table: [''],
				},
			},
			typeOptions: {
				loadOptionsMethod: 'getTableFields',
				loadOptionsDependsOn: ['table'],
			},
			default: ['id', 'name'],
			placeholder: 'Виберіть поля',
			description:
				'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Ліміт',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: {
				minValue: 1,
			},
			description: 'Max number of results to return',
		},
		{
			displayName: 'Зміщення',
			name: 'offset',
			type: 'number',
			default: 0,
			typeOptions: {
				minValue: 0,
			},
			description: 'Кількість записів для пропуску',
		},
		{
			displayName: 'Sort',
			name: 'sort',
			type: 'fixedCollection',
			typeOptions: {
				multipleValues: true,
			},
			placeholder: 'Add Sort Rule',
			default: {},
			options: [
				{
					displayName: 'Values',
					name: 'values',
					values: [
						{
							// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
							displayName: 'Column',
							name: 'column',
							type: 'options',
							// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
							description:
								'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>',
							default: '',
							typeOptions: {
								loadOptionsMethod: 'getTableFields',
								loadOptionsDependsOn: ['table'],
							},
						},
						{
							displayName: 'Direction',
							name: 'direction',
							type: 'options',
							options: [
								{
									name: 'ASC',
									value: 'ASC',
								},
								{
									name: 'DESC',
									value: 'DESC',
								},
							],
							default: 'ASC',
						},
					],
				},
			],
		},
	],

	updateById: [
		{
			displayName: 'ID запису',
			name: 'recordId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'Введіть ID запису',
			description: 'Унікальний ідентифікатор запису для оновлення',
		},
		{
			displayName: 'Data',
			name: 'data',
			type: 'createEntity',
			placeholder: 'Add field',
			default: [],
			typeOptions: {
				loadOptionsMethod: 'getTableFields',
				loadFieldSelectOptionsMethod: 'searchEntityData',
				loadEnumOptionsMethod: 'searchEnumOptions',
			},
			displayOptions: {
				show: {
					action: ['create', 'update'],
				},
			},
		},
		{
			displayName: 'Дані для оновлення',
			name: 'staticData',
			type: 'json',
			default: '{}',
			required: true,
			placeholder: '{ "field1": "новеЗначення1", "field2": "новеЗначення2" }',
			description: "JSON об'єкт з даними для оновлення запису",
		},
	],

	deleteById: [
		{
			displayName: 'ID запису',
			name: 'recordId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'Введіть ID запису',
			description: 'Унікальний ідентифікатор запису для видалення',
		},
	],
};
