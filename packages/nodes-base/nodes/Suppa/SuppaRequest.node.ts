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
import { NodeConnectionTypes, ApplicationError } from 'n8n-workflow';

export class SuppaRequest implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SUPPA Request Trigger',
		name: 'suppaRequest',
		icon: 'file:suppa.svg',
		group: ['trigger'],
		version: 1,
		description: 'Get data from Suppa API via webhooks',
		defaults: {
			name: 'Suppa Request Trigger',
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
				displayName: 'Request Name or ID',
				name: 'request',
				type: 'options',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'searchRequests',
				},
				required: true,
				placeholder: 'Виберіть таблицю',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Language Name or ID',
				name: 'language',
				type: 'options',
				default: 'author_language',
				typeOptions: {
					loadOptionsMethod: 'searchLanguages',
				},
				placeholder: 'Select a language',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
		],
	};

	methods = {
		loadOptions: {
			async searchRequests(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'GET',
					url: `${credentials.baseUrl}api/form_views/requests`,
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
			async searchLanguages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('suppaApi');
				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${credentials.baseUrl}api/instances/search/LanguageUI`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
					},
					body: {
						limit: 100,
						fields: {
							id: {},
							name: {},
							lang_id: {},
						},
					},
				};

				const staticItems = [
					{
						name: "Author's Language",
						value: 'author_language',
					},
					{
						name: "User's Language",
						value: 'user_language',
					},
				];

				try {
					const response = await this.helpers.httpRequest(requestOptions);
					return [
						...staticItems,
						...response.map((lang: any) => ({
							name: lang.name,
							value: lang.lang_id,
						})),
					];
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
						if ((error as any).response?.status === 404 || (error as any).statusCode === 404) {
							delete workflowStaticData.webhookId;
						}
					}
				}

				// Якщо webhookId не існує або webhook не знайдено, шукаємо за URL та таблицею
				const webhookUrl = this.getNodeWebhookUrl('default');
				const table = 'b20113e0-d9be-4281-bf23-7f546a41e07f';

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
							filter: {},
						},
					},
				};

				try {
					const response = await this.helpers.httpRequest(requestOptions);

					if ((response as any).status !== 200) {
						throw new ApplicationError(`Unexpected response status: ${(response as any).status}`);
					}

					const webhooks = Array.isArray(response) ? response : [response];

					this.logger.debug(`Webhook search response: ${JSON.stringify(webhooks)}`);

					// Перевіряємо, чи існує вебхук з нашою URL та таблицею
					const existingWebhook = webhooks.find(
						(webhook: any) =>
							webhook.url === webhookUrl &&
							webhook.entity_id === table &&
							webhook.is_active === true &&
							!webhook.deleted &&
							webhook.filter?.conditions &&
							Array.isArray(webhook.filter.conditions) &&
							webhook.filter.conditions.length === 1 &&
							webhook.filter.conditions[0].field === 'submitForm_id' &&
							webhook.filter.conditions[0].comparator === '=' &&
							webhook.filter.conditions[0].value === this.getNodeParameter('request'),
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
				const table = 'b20113e0-d9be-4281-bf23-7f546a41e07f';
				const events = ['insert'];
				const credentials = await this.getCredentials('suppaApi');
				const requestNameOrId = this.getNodeParameter('request') as string;

				this.logger.debug(
					`Creating webhook for table: ${table}, events: ${events}, URL: ${webhookUrl}`,
				);

				if (!requestNameOrId) {
					throw new ApplicationError('Не вказано форму (request) для підписки вебхука');
				}

				const filters = {
					conditions: [
						{
							comparator: '=',
							field: 'submitForm_id',
							type: 'condition',
							value: requestNameOrId,
						},
					],
					operator: 'and',
					type: 'conjunction',
				};

				const subscribeData: IDataObject = {
					url: webhookUrl,
					entity_id: table,
					events,
					is_active: true,
					filter: filters,
				};

				console.log('Subscribe data:', JSON.stringify(subscribeData));

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

					// Очікуємо об'єкт з id
					const responseId = (response as IDataObject)?.id as string | undefined;
					const apiError = (response as IDataObject)?.error as string | undefined;

					if (!responseId || apiError) {
						// Якщо вебхук був створений на бекенді, але є помилка в тілі — прибираємо його, щоб не лишати «сиріт»
						if (responseId) {
							try {
								await this.helpers.httpRequest({
									method: 'DELETE',
									url: `${credentials.baseUrl}api/instance/WebhookSubscription/${responseId}`,
									headers: { Authorization: `Bearer ${credentials.apiKey}` },
								});
							} catch {}
						}
						const msg = apiError ?? 'невідома помилка API';
						throw new ApplicationError(`Не вдалося створити вебхук: ${msg}`);
					}

					this.logger.debug(`Webhook creation response: ${JSON.stringify(response)}`);
					// Зберігаємо ID підписки для майбутньої відписки
					const webhookId = responseId;
					const workflowStaticData = this.getWorkflowStaticData('node');
					workflowStaticData.webhookId = webhookId;
					return true;
				} catch (error: unknown) {
					// Піднімаємо помилку для відображення в UI; додаємо статус та деталі якщо доступні
					const errAny = error as any;
					const status = errAny?.response?.status ?? errAny?.statusCode;
					const details = errAny?.response?.data ?? errAny?.message ?? String(error);
					throw new ApplicationError(
						`Помилка створення вебхука${status ? ` (HTTP ${status})` : ''}: ${
							typeof details === 'string' ? details : JSON.stringify(details)
						}`,
					);
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
		const bodyData = this.getBodyData() as IDataObject;

		// Перевіряємо, чи порожній payload
		if (Object.keys(bodyData).length === 0) {
			const res = this.getResponseObject();
			res.status(200).json({
				message: 'Success',
			});

			return {
				noWebhookResponse: true,
			};
		}

		const language = this.getNodeParameter('language') as string;
		const credentials = await this.getCredentials('suppaApi');
		const requestNameOrId = this.getNodeParameter('request') as string;
		let userId: string | undefined;
		if (language === 'user_language') {
			const instance = bodyData.instance as IDataObject | undefined;
			userId = instance?.['created_by_id'] as string | undefined;
		} else if (language === 'author_language') {
			const formDataRequestOptions: IHttpRequestOptions = {
				method: 'GET',
				url: `${credentials.baseUrl}api/instance/FormView/${requestNameOrId}`,
				headers: {
					Authorization: `Bearer ${credentials.apiKey}`,
				},
			};
			const formData = (await this.helpers.httpRequest(formDataRequestOptions)) as IDataObject;
			userId = formData['created_by_id'] as string | undefined;
		}

		let userLang: string | undefined;
		if (userId) {
			const userLangRequestOptions: IHttpRequestOptions = {
				method: 'GET',
				url: `${credentials.baseUrl}api/instance/SmartUser/${userId}`,
				headers: {
					Authorization: `Bearer ${credentials.apiKey}`,
				},
			};
			const userData = (await this.helpers.httpRequest(userLangRequestOptions)) as IDataObject;
			userLang = userData['language_id'] as string | undefined;
		} else {
			userLang = language;
		}

		const localizationRequestOptions: IHttpRequestOptions = {
			method: 'POST',
			url: `${credentials.baseUrl}/api/localization?languages=${userLang}`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: {
				filter: {
					conditions: [
						{
							comparator: '=',
							field: 'target_id',
							type: 'condition',
							value: requestNameOrId,
						},
					],
					operator: 'and',
					type: 'conjunction',
				},
			},
		};

		const localizationResp = await this.helpers.httpRequest(localizationRequestOptions);
		if (Array.isArray(localizationResp) && localizationResp.length > 0) {
			const translationKeys = (localizationResp[0] as IDataObject).translation_keys as
				| IDataObject
				| undefined;
			if (translationKeys) {
				(bodyData as IDataObject).localization = translationKeys;
			}

			// Пошук ключа перекладу з безпечними перевірками
			const searchTranslationKey = (value: string): string | undefined => {
				if (!translationKeys || typeof translationKeys !== 'object') return undefined;
				return Object.keys(translationKeys as object).find((tKey: string) =>
					tKey.includes(`.${value}`),
				);
			};

			// Допоміжний тип-гарда для перевірки, що значення — звичайний об'єкт
			const isRecord = (v: unknown): v is Record<string, unknown> =>
				typeof v === 'object' && v !== null && !Array.isArray(v);
			// Аккуратно приводимо formData до объекта і захищаємо від undefined/null
			let formDataObj: IDataObject | undefined;
			const instanceRaw = (bodyData as IDataObject).instance as unknown;
			if (instanceRaw && typeof instanceRaw === 'object' && !Array.isArray(instanceRaw)) {
				const maybeFormData = (instanceRaw as IDataObject).formData as unknown;
				if (maybeFormData && typeof maybeFormData === 'object' && !Array.isArray(maybeFormData)) {
					formDataObj = maybeFormData as IDataObject;
				}
			}
			const formDataKeys = formDataObj ? Object.keys(formDataObj as object) : [];
			const formDataPreview: IDataObject = formDataKeys.reduce((acc: IDataObject, key: string) => {
				const value = (formDataObj as IDataObject)[key];
				const tKey =
					searchTranslationKey(`${key}.label`) ||
					searchTranslationKey(`${key}.placeholder`) ||
					searchTranslationKey(`${key}.name`);
				const representation =
					tKey && translationKeys ? String((translationKeys as IDataObject)[tKey] ?? key) : key;
				const formatValueForPreview = (v: unknown): string => {
					if (isRecord(v)) {
						const nameVal = (v as Record<string, unknown>).name;
						return typeof nameVal === 'string' ? nameVal : JSON.stringify(v);
					} else if (Array.isArray(v)) {
						return JSON.stringify(v);
					} else {
						return String(v);
					}
				};
				Object.assign(acc, {
					[key]: `<b>${representation}</b>: ${formatValueForPreview(value)}`,
				});
				return acc;
			}, {});

			(bodyData as IDataObject).formDataPreview = formDataPreview;
		}

		return {
			workflowData: [this.helpers.returnJsonArray([bodyData])],
		};
	}
}
