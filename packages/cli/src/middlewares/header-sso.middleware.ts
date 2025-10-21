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

interface SsoTokenPayload {
	email: string;
	name?: string;
	roles?: string[];
}
interface ValidateResponse {
	token?: SsoTokenPayload;
}

export const headerSsoMiddleware: RequestHandler = async (req: APIRequest, _res, next) => {
	try {
		// Получаем токен из query, либо из заголовков (X-Access-Token или Authorization: Bearer ...)
		const queryToken = (req.query as { token?: string }).token;
		const headerToken = (req.headers['x-access-token'] as string) || undefined;
		const authHeader = (req.headers['authorization'] as string) || '';
		const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
			? authHeader.slice(7).trim()
			: undefined;
		const token = queryToken ?? headerToken ?? bearerToken;
		if (!token || !VALIDATE_URL) return next();

		const headers: Record<string, string> = {};
		headers['X-Access-Token'] = token;
		const { data } = await axios.get<ValidateResponse>(VALIDATE_URL, {
			headers,
			timeout: 5000,
		});
		if (!data?.token?.email) return next();
		const userRepository = Container.get(UserRepository);
		let user = await userRepository.findOne({ where: { email: data.token.email } });

		console.log('Header-SSO token data:', user, data.token);

		const roles = Array.isArray(data.token.roles) ? data.token.roles : [];
		const isAdmin = roles.includes('admin');
		const assignedRole = isAdmin ? 'global:owner' : 'global:member';

		if (!user) {
			// const memberRole =
			// 	(await roleRepository.findOne({ where: { name: 'member' } })) ??
			// 	(await roleRepository.findOne({ where: { name: 'user' } }));
			//
			const name = data.token.name ?? '';
			const [firstName, ...rest] = name.split(' ');
			const lastName = rest.join(' ');
			const password = await hash(uuid(), 10); // випадковий
			user = userRepository.create({
				id: uuid(),
				email: data.token.email,
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

		// Не используем browserId при выпуске куки в SSO-потоке, чтобы не требовать заголовок на последующих запросах
		authService.issueCookie(_res, user, false);

		const eventService = Container.get(EventService);
		eventService.emit('user-logged-in', {
			user,
			authenticationMethod: 'email',
		});
		console.log(`Header-SSO: User ${user.email} logged in via SSO`);
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
