import type {
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IHttpRequestOptions,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { actionFields } from './actionFields';
import { SuppaActionMethods } from './actionMethods';

export class Suppa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SUPPA',
		name: 'suppa',
		icon: 'file:suppa.svg',
		group: ['output'],
		version: 1,
		description: 'Get data from Suppa API',
		defaults: {
			name: 'Suppa',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'suppaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Таблиця Name or ID',
				name: 'table',
				type: 'options',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'searchTables',
				},
				required: true,
				placeholder: 'Виберіть таблицю',
				description:
					'Виберіть таблицю для виконання дії. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create',
						value: 'create',
					},
					{
						name: 'Delete by ID',
						value: 'deleteById',
					},
					{
						name: 'Get by Filter',
						value: 'getByFilter',
					},
					{
						name: 'Get by ID',
						value: 'getById',
					},
					{
						name: 'Update by ID',
						value: 'updateById',
					},
				],
				default: 'getById',
			},
			// Динамічні поля для кожної дії
			...Object.entries(actionFields).flatMap(([actionType, fields]) =>
				fields.map((field) => ({
					...field,
					displayOptions: {
						show: {
							action: [actionType],
						},
						...field.displayOptions,
					},
				})),
			),
		],
	};

	methods = {
		loadOptions: {
			async searchTables(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'GET',
					url: `${credentials.baseUrl}api/all_entities`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
				};

				try {
					const response = await this.helpers.httpRequest(requestOptions);
					return response.map((table: any) => ({
						name: table.name,
						value: table.id,
					}));
				} catch (error) {
					return [];
				}
			},

			async getTableFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tableId = this.getCurrentNodeParameter('table') as string;
				if (!tableId) {
					return [];
				}
				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'GET',
					url: `${credentials.baseUrl}api/entity_props/${tableId}`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
				};

				try {
					const response = await this.helpers.httpRequest(requestOptions);
					if (Array.isArray(response)) {
						return response
							.filter((field: any) => field.id !== 'entity_options')
							.map((field: any) => ({
								name: field.title || field.name,
								type: field.type,
								entityId:
									field.type === 'relation' ? field.relation.relation_target_entity_id : undefined,
								enumId: field.type === 'custom_enum' ? field.custom_enum.enum_id : undefined,
								options: (field?.items || field?.relation?.items || []).map((option: any) => ({
									name: option.name,
									value: option.id,
								})),
								value: field.id,
								multiple: field.multiple || false,
							}));
					}
					return [];
				} catch (error) {
					return [];
				}
			},

			async searchEntityData(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// const tableId = this.getCurrentNodeParameter('table') as string;
				// const fieldName = this.getCurrentNodeParameter('fieldName') as string;
				const entityId = this.getCurrentNodeParameter('entityId') as string;
				const searchTerm = (this.getCurrentNodeParameter('search') as string) || '';

				if (!entityId) {
					return [];
				}

				const body = {
					limit: 20,
					offset: 0,
					filter: {
						operator: 'and',
						conditions: [
							{
								field: 'name',
								comparator: 'like',
								value: searchTerm,
								type: 'condition',
							},
						],
						type: 'conjunction',
					},
				};

				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.baseUrl}api/instances/search/${entityId}`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
					body,
				};
				console.log('Response from entity data search:', JSON.stringify(requestOptions));
				try {
					const response = await this.helpers.httpRequest(requestOptions);
					// console.log('Response from entity data search:', response);
					if (Array.isArray(response)) {
						return response.map((item: any) => ({
							name: item.name || item.id,
							value: item.id,
						}));
					}
					return [];
				} catch (error) {
					console.log('Error fetching entity data:', error);
					return [];
				}
			},

			async searchEnumOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const enumId = this.getCurrentNodeParameter('enumId') as string;
				if (!enumId) {
					return [];
				}
				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'GET',
					url: `${credentials.baseUrl}api/custom_enums/values/${enumId}`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
				};
				try {
					const response = await this.helpers.httpRequest(requestOptions);
					if (Array.isArray(response)) {
						return response.map((option: any) => ({
							name: option.name,
							value: option.id,
						}));
					}
					return [];
				} catch (error) {
					return [];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('suppaApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const action = this.getNodeParameter('action', i) as string;
				const table = this.getNodeParameter('table', i) as string;

				let result: any;

				switch (action) {
					case 'create':
						result = await SuppaActionMethods.executeCreateAction(this, credentials, table, i);
						break;
					case 'getById':
						result = await SuppaActionMethods.executeGetByIdAction(this, credentials, table, i);
						break;
					case 'getByFilter':
						result = await SuppaActionMethods.executeGetByFilterAction(this, credentials, table, i);
						break;
					case 'updateById':
						result = await SuppaActionMethods.executeUpdateByIdAction(this, credentials, table, i);
						break;
					case 'deleteById':
						result = await SuppaActionMethods.executeDeleteByIdAction(this, credentials, table, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Невідома дія: ${action}`);
				}

				// returnData.push({
				// 	json: result.map((item: any) => ({ json: item })) || result,
				// });
				if (Array.isArray(result)) {
					for (const resItem of result) {
						returnData.push({ json: resItem, pairedItem: { item: i } });
					}
				} else {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}
