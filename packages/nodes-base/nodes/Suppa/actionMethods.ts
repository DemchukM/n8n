import {
	IExecuteFunctions,
	IHttpRequestOptions,
	IDataObject,
	ApplicationError,
} from 'n8n-workflow';

export class SuppaActionMethods {
	static async executeCreateAction(
		context: IExecuteFunctions,
		credentials: any,
		table: string,
		itemIndex: number,
	): Promise<any> {
		const data = context.getNodeParameter('data', itemIndex) as IDataObject;

		const requestOptions: IHttpRequestOptions = {
			method: 'POST',
			url: `${credentials.baseUrl}api/instance/${table}/`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: data,
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
		let url = `${credentials.baseUrl}api/instance/${table}/${recordId}`;

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
		const fields = context.getNodeParameter('fields', itemIndex, []) as string[];
		const limit = context.getNodeParameter('limit', itemIndex, 50) as number;
		const offset = context.getNodeParameter('offset', itemIndex, 0) as number;
		const sort = context.getNodeParameter('sort', itemIndex, {}) as IDataObject;

		const body: IDataObject = {
			limit,
			offset,
		};

		if (Object.keys(filters).length > 0) {
			body.filters = filters;
		}

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
		const data = context.getNodeParameter('data', itemIndex) as IDataObject;

		const requestOptions: IHttpRequestOptions = {
			method: 'PUT',
			url: `${credentials.baseUrl}api/instance/${table}/${recordId}`,
			headers: {
				Authorization: `Bearer ${credentials.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: data,
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
