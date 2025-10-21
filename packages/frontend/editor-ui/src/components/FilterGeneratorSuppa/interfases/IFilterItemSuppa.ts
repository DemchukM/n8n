interface IFilterItemSuppa {
	type: 'condition';
	prop: object;
	field: string;
	comparator: string;
	value:
		| string
		| number
		| boolean
		| null
		| string[]
		| number[]
		| boolean[]
		| null[]
		| object
		| object[];
}

export { IFilterItemSuppa };
