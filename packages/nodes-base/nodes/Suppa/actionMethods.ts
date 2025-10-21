import type { IExecuteFunctions, IHttpRequestOptions, IDataObject } from 'n8n-workflow';
import { ApplicationError, jsonParse } from 'n8n-workflow';
import { compareFiltersSuppa, prepareFiltersSuppa } from './helpers';

export class SuppaActionMethods {
	static async executeCreateAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const dataRaw = context.getNodeParameter('data', itemIndex, []) as unknown;
		const staticData = context.getNodeParameter('staticData', itemIndex, '{}') as string;

		function formatValue(value: unknown): unknown {
			// strings: trim and try to parse JSON if looks like object/array
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
					try {
						return JSON.parse(trimmed);
					} catch {
						return trimmed;
					}
				}
				return trimmed;
			}

			// arrays: map recursively
			if (Array.isArray(value)) {
				return value.map((v) => formatValue(v));
			}

			// plain objects: keep props and mirror `value` into `id` if present
			if (value && typeof value === 'object') {
				const obj = value as Record<string, unknown>;
				const id = 'value' in obj ? obj['value'] : undefined;
				return { ...obj, id } as IDataObject;
			}

			return value;
		}

		// Build payload object safely from array of { field, value }
		const createData: IDataObject = {};
		if (Array.isArray(dataRaw)) {
			for (const entry of dataRaw) {
				if (entry && typeof entry === 'object' && 'field' in entry) {
					const { field, value } = entry as { field: unknown; value: unknown };
					if (typeof field === 'string' && field.length > 0) {
						createData[field] = formatValue(value) as IDataObject[keyof IDataObject];
					}
				}
			}
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'POST',
			url: `${credentials.baseUrl}api/instance/${table}/`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: {
				...createData,
				// use safe JSON parse for staticData
				...(staticData ? (jsonParse(staticData) as IDataObject) : {}),
			},
		};

		return await context.helpers.httpRequest(requestOptions);
	}

	static async executeGetByIdAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const recordId = context.getNodeParameter('recordId', itemIndex) as string;
		const url = `${credentials.baseUrl}api/instance/${table}/${recordId}`;

		const requestOptions: IHttpRequestOptions = {
			method: 'GET',
			url,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
			},
		};
		return await context.helpers.httpRequest(requestOptions);
	}

	static async executeGetByFilterAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const filters = context.getNodeParameter('filters', itemIndex, {}) as IDataObject;
		const filtersAdvanced = context.getNodeParameter('filtersAdvanced', itemIndex, '{}') as unknown;
		const fields = context.getNodeParameter('fields', itemIndex, []) as string[];
		const limit = context.getNodeParameter('limit', itemIndex, 50) as number;
		const offset = context.getNodeParameter('offset', itemIndex, 0) as number;
		const sort = context.getNodeParameter('sort', itemIndex, {}) as IDataObject;

		// normalize filters in place
		prepareFiltersSuppa(filters);

		// safely parse advanced filter which may be a JSON string or object/array
		let advancedFilterObj: unknown = {};
		if (typeof filtersAdvanced === 'string') {
			advancedFilterObj = jsonParse(filtersAdvanced || '{}', { fallbackValue: {} }) as unknown;
		} else if (
			filtersAdvanced &&
			(typeof filtersAdvanced === 'object' || Array.isArray(filtersAdvanced))
		) {
			advancedFilterObj = filtersAdvanced as unknown;
		}
		// normalize advanced as well (can be array or object)
		prepareFiltersSuppa(advancedFilterObj);

		const body: IDataObject = {
			limit,
			offset,
		};

		// merge basic and advanced filters into a single filter object
		const combinedFilter: IDataObject = compareFiltersSuppa(filters, advancedFilterObj);
		if (Object.keys(combinedFilter).length > 0) {
			body.filter = combinedFilter;
		}

		console.log('Combined Filter:', JSON.stringify(combinedFilter), filters);

		if (fields.length > 0) {
			body.fields = fields.reduce((acc, field) => {
				acc[field] = {};
				return acc;
			}, {} as IDataObject);
		}

		if (Object.keys(sort).length > 0) {
			body.sort = sort;
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'POST',
			url: `${credentials.baseUrl}api/instances/search/${table}`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body,
		};

		return await context.helpers.httpRequest(requestOptions);
	}

	static async executeUpdateByIdAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const recordId = context.getNodeParameter('recordId', itemIndex) as string;
		const dataRaw = context.getNodeParameter('data', itemIndex, []) as unknown;

		function formatValue(value: unknown): unknown {
			// strings: trim and try to parse JSON if looks like object/array
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
					try {
						return JSON.parse(trimmed);
					} catch {
						return trimmed;
					}
				}
				return trimmed;
			}

			// arrays: map recursively
			if (Array.isArray(value)) {
				return value.map((v) => formatValue(v));
			}

			// plain objects: keep props and mirror `value` into `id` if present
			if (value && typeof value === 'object') {
				const obj = value as Record<string, unknown>;
				const id = 'value' in obj ? obj['value'] : undefined;
				return { ...obj, id } as IDataObject;
			}

			return value;
		}

		// Build payload object safely from array of { field, value }
		const createData: IDataObject = {};
		if (Array.isArray(dataRaw)) {
			for (const entry of dataRaw) {
				if (entry && typeof entry === 'object' && 'field' in entry) {
					const { field, value } = entry as { field: unknown; value: unknown };
					if (typeof field === 'string' && field.length > 0) {
						createData[field] = formatValue(value) as IDataObject[keyof IDataObject];
					}
				}
			}
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'PUT',
			url: `${credentials.baseUrl}api/instance/${table}/${recordId}`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: createData,
		};

		return await context.helpers.httpRequest(requestOptions);
	}

	static async executeDeleteByIdAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const recordId = context.getNodeParameter('recordId', itemIndex) as string;
		const confirm = context.getNodeParameter('confirm', itemIndex) as boolean;

		if (!confirm) {
			throw new ApplicationError(
				'Підтвердіть видалення запису, встановивши прапорець "Підтвердження"',
			);
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'DELETE',
			url: `${credentials.baseUrl}api/instance/${table}/${recordId}`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
			},
		};

		return await context.helpers.httpRequest(requestOptions);
	}
}
