import type {
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IHttpRequestOptions,
	IWebhookFunctions,
	IWebhookResponseData,
	IDataObject,
	IHookFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class SuppaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SUPPA Event Trigger',
		name: 'suppaTrigger',
		icon: 'file:suppa.svg',
		group: ['trigger'],
		version: 1,
		description: 'Get data from Suppa API via webhooks',
		defaults: {
			name: 'Suppa Node',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'suppaApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'suppa',
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
				displayName: 'Event',
				name: 'event',
				type: 'multiOptions',
				noDataExpression: true,
				options: [
					{
						name: 'Create',
						value: 'insert',
					},
					{
						name: 'Update',
						value: 'update',
					},
					{
						name: 'Delete',
						value: 'delete',
					},
				],
				default: ['insert'],
			},
			{
				displayName: 'Поля Names or IDs',
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
				default: [],
				placeholder: 'Виберіть поля',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Фільтри (JSON)',
				name: 'filters',
				type: 'json',
				default: {},
				placeholder: '{ "field": "value" }',
				description: 'Додаткові фільтри для вебхука у форматі JSON',
			},
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
								value: field.id,
							}));
					}
					return [];
				} catch (error) {
					return [];
				}
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const workflowStaticData = this.getWorkflowStaticData('node');
				const webhookId = workflowStaticData.webhookId;
				const credentials = await this.getCredentials('suppaApi');

				this.logger.debug(`Checking webhook existence with ID: ${webhookId}`);

				// Спочатку перевіряємо за збереженим webhookId
				if (webhookId) {
					const requestOptions: IHttpRequestOptions = {
						method: 'GET',
						url: `${credentials.baseUrl}api/instance/WebhookSubscription/${webhookId}`,
						headers: {
							Authorization: `Bearer ${credentials.apiKey}`,
						},
					};

					try {
						const response = await this.helpers.httpRequest(requestOptions);
						// Якщо отримали відповідь, то webhook існує
						this.logger.debug(`Webhook check response: ${JSON.stringify(response)}`);
						if (response && response.id === webhookId && response.is_active) {
							return true;
						} else {
							// Якщо webhook не активний, видаляємо збережений ID
							delete workflowStaticData.webhookId;
							return false;
						}
					} catch (error) {
						// Якщо помилка 404, то webhook не існує, видаляємо збережений ID
						if (error.response?.status === 404 || error.statusCode === 404) {
							delete workflowStaticData.webhookId;
						}
					}
				}

				// Якщо webhookId не існує або webhook не знайдено, шукаємо за URL та таблицею
				const webhookUrl = this.getNodeWebhookUrl('default');
				const table = this.getNodeParameter('table') as string;

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.baseUrl}api/instances/search/WebhookSubscription`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
					body: {
						limit: 100,
						fields: {
							id: {},
							url: {},
							entity_id: {},
							is_active: {},
							deleted: {},
						},
					},
				};

				try {
					const response = await this.helpers.httpRequest(requestOptions);
					const webhooks = Array.isArray(response) ? response : [response];

					this.logger.debug(`Webhook search response: ${JSON.stringify(webhooks)}`);

					// Перевіряємо, чи існує вебхук з нашою URL та таблицею
					const existingWebhook = webhooks.find(
						(webhook: any) =>
							webhook.url === webhookUrl &&
							webhook.entity_id === table &&
							webhook.is_active === true &&
							!webhook.deleted,
					);

					if (existingWebhook) {
						// Зберігаємо ID для майбутнього використання
						workflowStaticData.webhookId = existingWebhook.id;
						return true;
					}

					return false;
				} catch (error) {
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const table = this.getNodeParameter('table') as string;
				const events = this.getNodeParameter('event') as string[];
				const fields = this.getNodeParameter('fields') as string[];
				const filters = this.getNodeParameter('filters') as IDataObject;
				const credentials = await this.getCredentials('suppaApi');

				this.logger.debug(
					`Creating webhook for table: ${table}, events: ${events}, URL: ${webhookUrl}`,
				);

				const subscribeData: IDataObject = {
					url: webhookUrl,
					entity_id: table,
					events: events,
					is_active: true,
					update_fields: fields.length > 0 ? fields : undefined, // Додаємо поля тільки якщо вони вказані
					filters: filters && Object.keys(filters).length > 0 ? filters : undefined, // Додаємо фільтри якщо вони є
				};

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.baseUrl}api/instance/WebhookSubscription/`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
						'Content-Type': 'application/json',
					},
					body: subscribeData,
				};

				try {
					const response = await this.helpers.httpRequest(requestOptions);

					this.logger.debug(`Webhook creation response: ${JSON.stringify(response)}`);
					// Зберігаємо ID підписки для майбутньої відписки
					const webhookId = response.id;
					if (webhookId) {
						const workflowStaticData = this.getWorkflowStaticData('node');
						workflowStaticData.webhookId = webhookId;
					}

					return true;
				} catch (error) {
					return false;
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const workflowStaticData = this.getWorkflowStaticData('node');
				const webhookId = workflowStaticData.webhookId;

				if (!webhookId) {
					// Немає ID підписки, можливо вже відписались
					return true;
				}

				const credentials = await this.getCredentials('suppaApi');

				const requestOptions: IHttpRequestOptions = {
					method: 'DELETE',
					url: `${credentials.baseUrl}api/instance/WebhookSubscription/${webhookId}`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
				};

				try {
					await this.helpers.httpRequest(requestOptions);

					// Видаляємо збережений ID
					delete workflowStaticData.webhookId;

					return true;
				} catch (error) {
					return false;
				}
			},
		},
	};

	// Обробка вхідних вебхук запитів
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData();

		// Перевіряємо, чи порожній payload
		if (Object.keys(bodyData).length === 0) {
			this.logger.info('Received health-check request, responding with 200 OK.');

			const res = this.getResponseObject();
			res.status(200).json({
				message: 'Success',
			});

			return {
				noWebhookResponse: true,
			};
		}

		this.logger.debug(`Received webhook data: ${JSON.stringify(bodyData)}`);

		return {
			workflowData: [this.helpers.returnJsonArray([bodyData])],
		};
	}
}
