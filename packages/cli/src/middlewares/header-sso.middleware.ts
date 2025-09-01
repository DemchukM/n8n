// packages/cli/src/middlewares/header-sso.middleware.ts
import type { RequestHandler } from 'express';
import type { AxiosError } from 'axios';
import axios from 'axios';
import { Container } from '@n8n/di';
import { Logger } from '@n8n/backend-common';
import {
	UserRepository,
	ProjectRepository,
	ProjectRelationRepository,
	type User,
	type APIRequest,
	type AuthenticatedRequest,
} from '@n8n/db';
import { EventService } from '@/events/event.service';
import { AuthService } from '@/auth/auth.service';

import { hash } from 'bcryptjs';
import { v4 as uuid } from 'uuid';

export async function ensurePersonalProject(user: User) {
	const projectRepo = Container.get(ProjectRepository);
	const relationRepo = Container.get(ProjectRelationRepository);

	// 1. Чи вже є?
	let project = await projectRepo.getPersonalProjectForUser(user.id);
	if (project) return project;

	// 2. Створюємо сам проєкт
	project = projectRepo.create({
		id: uuid(),
		name: `${user.firstName || user.lastName || user.email.split('@')[0]}'s space`,
		type: 'personal', // ключове
	});
	await projectRepo.save(project);

	// 3. Прописуємо зв'язок "user ↔ personalOwner"
	const relation = relationRepo.create({
		userId: user.id,
		projectId: project.id,
		role: 'project:personalOwner',
	});
	await relationRepo.save(relation);

	return project;
}

const VALIDATE_URL =
	process.env.IFRAME_SSO_VALIDATE_URL ?? 'https://smart.modern-expo.com/auth/token/';

export const headerSsoMiddleware: RequestHandler = async (req: APIRequest, _res, next) => {
	try {
		const token = (req.query as { token?: string }).token;
		if (!token || !VALIDATE_URL) return next();

		const { data } = await axios.get<{ token?: Record<string, any> }>(VALIDATE_URL, {
			headers: { 'X-Access-Token': token },
			timeout: 5000,
		});
		if (!data?.token?.email) return next();
		const userRepository = Container.get(UserRepository);
		let user = await userRepository.findOne({ where: { email: data?.token?.email } });

		const isAdmin = data?.token?.roles?.includes('admin');
		const assignedRole = isAdmin ? 'global:owner' : 'global:member';

		if (!user) {
			// const memberRole =
			// 	(await roleRepository.findOne({ where: { name: 'member' } })) ??
			// 	(await roleRepository.findOne({ where: { name: 'user' } }));
			//
			const firstName = data?.token.name?.split(' ').slice(0, -1).join(' ') ?? '';
			const lastName = data?.token.name?.split(' ').slice(-1).join(' ') ?? '';
			const password = await hash(uuid(), 10); // випадковий
			user = userRepository.create({
				id: uuid(),
				email: data?.token.email,
				firstName,
				lastName,
				role: assignedRole,
				password,
			});
			console.log('Created new user from Header-SSO:', user);
			await userRepository.save(user);
			await ensurePersonalProject(user);
		} else {
			user.role = assignedRole;
			await userRepository.save(user);
		}

		const authService = Container.get(AuthService);

		authService.clearCookie(_res);

		(req as AuthenticatedRequest).user = user;

		authService.issueCookie(_res, user, false, req.browserId);

		const eventService = Container.get(EventService);
		eventService.emit('user-logged-in', {
			user,
			authenticationMethod: 'email',
		});
		next();
	} catch (e) {
		const logger = Container.get(Logger);
		const msg =
			(e as AxiosError).response?.status === 401
				? 'Токен не пройшов перевірку'
				: (e as Error).message;
		logger.warn(`Header-SSO: ${msg}`);
		next(); // продовжуємо без сесії
	}
};
