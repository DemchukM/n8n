import type { IFilterItemSuppa } from '@/components/FilterGeneratorSuppa/interfases/IFilterItemSuppa';

interface IFilterGroupSuppa {
	type: 'conjunction';
	operator: 'and' | 'or';
	conditions: Array<IFilterGroupSuppa | IFilterItemSuppa>;
}

export { IFilterGroupSuppa };
