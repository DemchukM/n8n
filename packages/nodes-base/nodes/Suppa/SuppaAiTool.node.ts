import {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
	NodeConnectionTypes,
	IHttpRequestOptions,
	ApplicationError,
} from 'n8n-workflow';

import { DynamicTool } from 'langchain/tools';

const system_description = `
Use this tool to interact with the Suppa API. Pass a JSON string with the following structure:

{
  "action": "REQUIRED_ACTION",
  "table": "table_name",
  "data": {...}
}

Available actions:
- getTables: Get all tables (no other params needed)
- getTableFields: Get fields for a table (requires table)
- getById: Get record by ID (requires table, data.id)
- getByFilter: Query records (requires table, optional data with filters)
- create: Create new record (requires table, data)
- updateById: Update record (requires table, data.id, data)
- deleteById: Delete record (requires table, data.id)

Examples:
- Get tables: {"action": "getTables"}
- Get user by ID: {"action": "getById", "table": "users", "data": {"id": "123"}}
- Create user: {"action": "create", "table": "users", "data": {"name": "John", "email": "john@example.com"}}
`;

export class SuppaAiTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SUPPA AI Tool',
		name: 'suppaAiTool',
		icon: 'file:suppa.svg',
		group: ['transform'],
		version: 1,
		description: 'AI Tool to perform actions on Suppa API',
		defaults: {
			name: 'SUPPA AI Tool',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiTool],
		outputNames: ['Tool'],
		usableAsTool: true,
		properties: [],
		credentials: [
			{
				name: 'suppaApi',
				required: true,
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const httpRequest = this.helpers.httpRequest;
		const credentials = await this.getCredentials('suppaApi');
		const logger = this.logger;
		console.log('--------Credentials: ', credentials, itemIndex);
		const tool = new DynamicTool({
			name: 'suppa_tool',
			description: system_description,
			func: async (input: string) => {
				try {
					// Parse the input JSON
					const parsedInput = JSON.parse(input);
					const { action, table, data } = parsedInput;

					// Validate required parameters
					if (!action) {
						throw new ApplicationError('Action parameter is required');
					}

					// Get credentials

					if (!credentials) {
						throw new ApplicationError('Suppa API credentials not found');
					}

					const baseUrl = credentials.baseUrl as string;
					const apiKey = credentials.apiKey as string;

					// Build request options based on action
					let requestOptions: IHttpRequestOptions;

					switch (action) {
						case 'getTables':
							requestOptions = {
								method: 'GET',
								url: `${baseUrl}api/all_entities`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
							};
							break;

						case 'getTableFields':
							if (!table) {
								throw new ApplicationError('Table parameter is required for getTableFields action');
							}
							requestOptions = {
								method: 'GET',
								url: `${baseUrl}api/entity_props/${table}`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
							};
							break;

						case 'getById':
							if (!table || !data?.id) {
								throw new ApplicationError(
									'Table and data.id parameters are required for getById action',
								);
							}
							requestOptions = {
								method: 'GET',
								url: `${baseUrl}/tables/${table}/records/${data.id}`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
							};
							break;

						case 'getByFilter':
							if (!table) {
								throw new ApplicationError('Table parameter is required for getByFilter action');
							}
							requestOptions = {
								method: 'POST',
								url: `${baseUrl}/tables/${table}/query`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify(data || {}),
							};
							break;

						case 'create':
							if (!table || !data) {
								throw new ApplicationError(
									'Table and data parameters are required for create action',
								);
							}
							requestOptions = {
								method: 'POST',
								url: `${baseUrl}/tables/${table}/records`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify(data),
							};
							break;

						case 'updateById':
							if (!table || !data?.id) {
								throw new ApplicationError(
									'Table and data.id parameters are required for updateById action',
								);
							}
							requestOptions = {
								method: 'PUT',
								url: `${baseUrl}/tables/${table}/records/${data.id}`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify(data),
							};
							break;

						case 'deleteById':
							if (!table || !data?.id) {
								throw new ApplicationError(
									'Table and data.id parameters are required for deleteById action',
								);
							}
							requestOptions = {
								method: 'DELETE',
								url: `${baseUrl}/tables/${table}/records/${data.id}`,
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
								},
							};
							break;

						default:
							throw new ApplicationError(`Unknown action: ${action}`);
					}

					logger.debug(`--------Request Options: ${JSON.stringify(requestOptions)}`);
					// Make the HTTP request
					const response = await httpRequest(requestOptions);

					logger.debug(`--------Response: ${JSON.stringify(response)}`);

					if (action === 'getTables') {
						// Format response for getTables action
						return JSON.stringify(
							response.map((table: any) => ({
								name: table.name,
								value: table.id,
							})),
						);
					}

					return JSON.stringify(response);
				} catch (error) {
					if (error instanceof Error) {
						return `Error: ${error.message}`;
					}
					return 'An unexpected error occurred';
				}
			},
		});

		return {
			response: tool,
		};
	}
}
