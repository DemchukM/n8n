import type { IDataObject } from 'n8n-workflow';

export type SuppaCredentials = {
	baseUrl: string;
	apiKey: string;
};

// Types for SUPPA filter structure
export type SuppaCondition = {
	type: 'condition';
	field?: string;
	comparator?: string;
	value: unknown;
};

export type SuppaConjunction = {
	type: 'conjunction';
	operator?: string;
	conditions: SuppaFilter[];
};

export type SuppaFilter = SuppaCondition | SuppaConjunction | IDataObject;

// Map UI tokens to backend symbols
const COMPARATOR_TO_BACKEND: Record<string, string> = {
	// equality
	eq: '=',
	equals: '=',
	'==': '=',
	// inequality
	neq: '!=',
	'!==': '!=',
	'<>': '!=',
	// greater/less
	gt: '>',
	gte: '>=',
	lt: '<',
	lte: '<=',
};

function normalizeComparatorToBackend(raw?: unknown): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const key = raw.trim().toLowerCase();
	return COMPARATOR_TO_BACKEND[key] ?? raw; // если неизвестный — оставляем как есть (включая уже-символы)
}

// Normalize value(s) in condition to ensure object values keep their id property
export function prepareValueFiltersSuppa(value: unknown): unknown {
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		return { ...obj, id: obj['value'] } as IDataObject;
	}
	return value;
}

// Mutates filter object in place to normalize nested values (supports arrays)
export function prepareFiltersSuppa(filter: unknown): void {
	if (!filter) return;
	if (Array.isArray(filter)) {
		for (const item of filter) prepareFiltersSuppa(item);
		return;
	}
	if (typeof filter !== 'object') return;

	const f = filter as Record<string, unknown> & {
		type?: string;
		comparator?: string;
		value?: unknown;
		conditions?: unknown[];
	};

	if (f.type === 'condition') {
		// normalize comparator tokens from UI to backend symbols/keywords
		const normalized = normalizeComparatorToBackend(f.comparator);
		if (normalized) f.comparator = normalized;

		// normalize value(s)
		if (Array.isArray(f.value)) {
			f.value = (f.value as unknown[]).map((v) => prepareValueFiltersSuppa(v));
		} else {
			f.value = prepareValueFiltersSuppa(f.value);
		}
	} else if (Array.isArray(f.conditions)) {
		for (const c of f.conditions) prepareFiltersSuppa(c);
	}
}

// Merge basic and advanced filters into a single object with merged `conditions`
export function compareFiltersSuppa(basicInput: unknown, advancedInput: unknown): IDataObject {
	// normalize basic as object
	const basic: IDataObject =
		basicInput && typeof basicInput === 'object' && !Array.isArray(basicInput)
			? (basicInput as IDataObject)
			: {};

	// detect advanced type
	const isAdvancedArray = Array.isArray(advancedInput);
	const isAdvancedObject =
		!!advancedInput && typeof advancedInput === 'object' && !Array.isArray(advancedInput);

	// split out conditions and the rest from basic
	const { conditions: bCondRaw, ...basicRest } = basic as Record<string, unknown>;
	const basicConditions = Array.isArray(bCondRaw) ? (bCondRaw as unknown[]) : [];

	let advancedRest: Record<string, unknown> = {};
	let advancedConditions: unknown[] = [];

	if (isAdvancedArray) {
		advancedConditions = advancedInput as unknown[];
	} else if (isAdvancedObject) {
		const { conditions: aCondRaw, ...aRest } = advancedInput as Record<string, unknown>;
		advancedRest = aRest;
		advancedConditions = Array.isArray(aCondRaw) ? (aCondRaw as unknown[]) : [];
	}

	const result: IDataObject = { ...(basicRest as IDataObject), ...(advancedRest as IDataObject) };
	const mergedConditions = [...basicConditions, ...advancedConditions];
	if (mergedConditions.length > 0) {
		(result as Record<string, unknown>).conditions = mergedConditions;
	}
	return result;
}
