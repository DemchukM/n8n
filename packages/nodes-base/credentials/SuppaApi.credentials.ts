import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SuppaApi implements ICredentialType {
	name = 'suppaApi';
	displayName = 'Suppa API';
	documentationUrl =
		'https://docs.n8n.io/integrations/creating-nodes/build/declarative-style-node/';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://smart.modern-expo.com/',
			placeholder: 'https://smart.modern-expo.com/',
			description: 'The base URL for the Suppa API. Ensure it ends with a slash.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Your API key for authentication',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Добавляем тест соединения
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/accounts',
			method: 'GET',
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				Accept: 'application/json',
			},
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 200,
					message: 'Successfully connected to Suppa API',
				},
			},
		],
	};
}
